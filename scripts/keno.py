"""
Keno Game - Randomly picks 15 numbers with ball drop animation.
Uses the same coordinate system as keno_overlay_test.py.
Sends state updates to the node.js server via HTTP POST.
"""
import pygame
import sys
import os
import random
import json
import threading
import urllib.request
import urllib.error
from collections import Counter

# Initialize pygame
pygame.init()

# Get the directory where this script is located
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(SCRIPT_DIR, "assets")

# Constants
SCREEN_WIDTH, SCREEN_HEIGHT = 1920, 1080
FPS = 60

# Colors
WHITE = (255, 255, 255)
GREEN = (0, 255, 0)
YELLOW = (255, 255, 0)
DARK_GREEN = (0, 180, 0)
DCC59C = (220, 197, 156)
RED = (255, 0, 0)
GOLD = (255, 215, 0)
BLACK = (0, 0, 0)

# Layout derived from mapped points (same as keno_overlay_test.py)
COLS_X = [651, 830, 1010, 1188, 1365]
GROUP_Y_STARTS = [203, 362, 585, 736]
SUB_ROW_DELTA = 82

# Setup display
screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.FULLSCREEN)
pygame.display.set_caption("Keno - Number Draw")
clock = pygame.time.Clock()
font = pygame.font.Font(None, 60)
big_font = pygame.font.Font(None, 72)
hud_font = pygame.font.Font(None, 48)
top20_font = pygame.font.Font(None, 32)
top20_title_font = pygame.font.Font(None, 36)
ball_font = pygame.font.Font(None, 72)  # Font for number on ball

# Load background
background_img = pygame.image.load(os.path.join(ASSETS_DIR, "keno_background.png")).convert()
background_img = pygame.transform.scale(background_img, (SCREEN_WIDTH, SCREEN_HEIGHT))

# Load the yellow number overlay image
yellow_number_img = pygame.image.load(os.path.join(ASSETS_DIR, "keno_yellow_number.png")).convert_alpha()
OVERLAY_W = yellow_number_img.get_width()
OVERLAY_H = yellow_number_img.get_height()

# Load the ball image
ball_img_orig = pygame.image.load(os.path.join(ASSETS_DIR, "keno_ball.png")).convert_alpha()
BALL_W = ball_img_orig.get_width()
BALL_H = ball_img_orig.get_height()

# Pre-render ball surfaces with numbers
ball_surfaces = {}
for num in range(1, 41):
    # Copy the ball image
    ball_surf = ball_img_orig.copy()
    # Render number text in black, centered on the ball
    num_label = ball_font.render(str(num), True, BLACK)
    num_rect = num_label.get_rect(center=(BALL_W // 2, BALL_H // 2))
    ball_surf.blit(num_label, num_rect)
    ball_surfaces[num] = ball_surf

# ---- Server communication ----
import server_config

SERVER_STATE_UPDATE_URL = server_config.get_endpoint("/api/keno/state-update")

# ---- Load game config from YAML ----
_keno_config = server_config.load_game_config("keno")
NEXT_DRAW_INTERVAL = _keno_config.get("next_draw_interval", 30000)
BETTING_DURATION = _keno_config.get("betting_duration", 25000)
CLOSING_DURATION = _keno_config.get("closing_duration", 5000)
RESULTS_DISPLAY_DURATION = _keno_config.get("results_display_duration", 3000)


def send_state_update(state_data):
    """Send game state update to the node.js server (non-blocking)."""
    def _send():
        try:
            data = json.dumps(state_data).encode('utf-8')
            req = urllib.request.Request(
                SERVER_STATE_UPDATE_URL,
                data=data,
                headers={'Content-Type': 'application/json'},
                method='POST'
            )
            urllib.request.urlopen(req, timeout=1)
        except (urllib.error.URLError, urllib.error.HTTPError, Exception) as e:
            # Silently ignore connection errors - server might not be running
            pass
    
    threading.Thread(target=_send, daemon=True).start()


def send_phase_update(phase, draw_num, countdown_secs, message=None, message_type=None, drawn=None):
    """Helper to send a structured state update."""
    state = {
        "phase": phase,
        "drawNumber": draw_num,
        "countdownSeconds": countdown_secs,
    }
    if message:
        state["message"] = message
        state["messageType"] = message_type or "info"
    if drawn is not None:
        state["drawnNumbers"] = drawn
    send_state_update(state)


# ---- Top 20 History Tracking ----
pick_history = []  # Accumulates all picked numbers across draws


def get_number_position(num):
    """Calculate (x, y) for a given number 1-40."""
    group = (num - 1) // 10          # 0, 1, 2, 3
    sub_row = ((num - 1) % 10) // 5  # 0 or 1
    col = (num - 1) % 5              # 0, 1, 2, 3, 4

    x = COLS_X[col]
    y = GROUP_Y_STARTS[group] + (sub_row * SUB_ROW_DELTA)

    # Manual per-number adjustments
    if 26 <= num <= 30:
        y -= 5  # 26-30 up 5px

    return x, y


def build_keno_coords():
    """Generate the full 40-number coordinate dictionary."""
    coords = {}
    for num in range(1, 41):
        coords[num] = get_number_position(num)
    return coords


keno_coords = build_keno_coords()


def get_top_20():
    """Return the top 20 numbers from pick_history sorted by frequency desc, then number asc."""
    if not pick_history:
        return []
    counter = Counter(pick_history)
    # Sort by (-count, number)
    sorted_items = sorted(counter.items(), key=lambda x: (-x[1], x[0]))
    return sorted_items[:20]


# ---- Game Phases ----
BETTING = 0
CLOSING = 1
DRAWING = 2
FINALIZED = 3

game_phase = BETTING
phase_timer = 0
draw_number = 1

# Countdown for NEXT DRAW display (30s total, starts when game starts)
NEXT_DRAW_COUNTDOWN_TOTAL = 30000  # 30 seconds
next_draw_countdown_timer = 0

# Randomly pick 15 numbers
picked_numbers = random.sample(range(1, 41), 15)
print(f"Picked numbers: {picked_numbers}")

# ---- Ball Animation State ----
# States for each number's ball animation
BALL_DROPPING = 0   # Ball falling with gravity, bouncing
BALL_FLASHING = 1   # Ball at bottom, yellow tile flashing
BALL_ZOOMING = 2    # Ball zooming straight up
BALL_DONE = 3       # Animation complete for this number

revealed_numbers = []            # Numbers that are now static (always shown)
current_reveal_index = 0         # Index into picked_numbers for the one currently animating

# Ball physics
BALL_X = 480                     # X position for ball drop (moved right 20px total)
GROUND_Y = 765                   # Y position where ball lands (moved up 30px total)
GRAVITY = 0.01                   # px/ms² gravity (increased for fast drop)
BOUNCE_DAMPING = 0.5             # Energy retained on bounce
MAX_BOUNCES = 3                  # Bounce exactly 3 times then stop
ZOOM_SPEED = 30                  # px/ms upward speed for zoom-out

ball_state = BALL_DROPPING
ball_y = 0.0                     # Current Y position of ball
ball_vy = 0.0                    # Current velocity of ball
bounce_count = 0                 # Number of bounces so far

# Flash state (reused from original)
flash_count = 0
flash_visible = True
flash_timer = 0
FLASH_INTERVAL = 150             # ms between flash toggle
FLASH_CYCLES = 5                 # Number of ON/OFF pairs (e.g. 5 = 10 toggles total)

# Flashing yellow brick state for finalized phase
finalized_flash_timer = 0
finalized_flash_visible = True
FINALIZED_FLASH_INTERVAL = 300   # ms between flash toggle

all_done = False

# Next draw countdown
next_draw_countdown = 0

# Flag to track if we've sent the 10-second notification for this phase cycle
sent_10s_warning = False
# Flag to track if we've sent the closing notification
sent_closing_notification = False


def reset_draw():
    """Reset all draw-related state for a new draw."""
    global picked_numbers, revealed_numbers, current_reveal_index
    global flash_count, flash_visible, flash_timer
    global all_done, next_draw_countdown, next_draw_countdown_timer
    global ball_state, ball_y, ball_vy, bounce_count
    global finalized_flash_timer, finalized_flash_visible
    global sent_10s_warning, sent_closing_notification
    picked_numbers = random.sample(range(1, 41), 15)
    print(f"Picked numbers: {picked_numbers}")
    revealed_numbers = []
    current_reveal_index = 0
    flash_count = 0
    flash_visible = True
    flash_timer = 0
    all_done = False
    next_draw_countdown = 0
    next_draw_countdown_timer = 0
    ball_state = BALL_DROPPING
    ball_y = 0.0
    ball_vy = 0.0
    bounce_count = 0
    finalized_flash_timer = 0
    finalized_flash_visible = True
    sent_10s_warning = False
    sent_closing_notification = False


def start_next_ball():
    """Reset ball state for the next number in the sequence."""
    global ball_state, ball_y, ball_vy, flash_count, flash_visible, flash_timer, bounce_count
    ball_state = BALL_DROPPING
    ball_y = 0.0
    ball_vy = 0.0
    flash_count = 0
    flash_visible = True
    flash_timer = 0
    bounce_count = 0


def calculate_remaining_seconds():
    """Calculate seconds until next DRAWING phase."""
    global game_phase, phase_timer
    
    if game_phase == FINALIZED:
        remaining_ms = NEXT_DRAW_INTERVAL
    elif game_phase == BETTING:
        remaining_ms = (BETTING_DURATION - phase_timer) + CLOSING_DURATION
    elif game_phase == CLOSING:
        remaining_ms = (CLOSING_DURATION - phase_timer)
    else:
        remaining_ms = 0
    
    return max(0, int(remaining_ms / 1000))


def calculate_time_until_draw():
    """Calculate the exact milliseconds until the next DRAWING phase."""
    global game_phase, phase_timer
    
    if game_phase == FINALIZED:
        return NEXT_DRAW_INTERVAL + RESULTS_DISPLAY_DURATION
    elif game_phase == BETTING:
        return (BETTING_DURATION - phase_timer) + CLOSING_DURATION
    elif game_phase == CLOSING:
        return (CLOSING_DURATION - phase_timer)
    else:
        return 0


# Send initial BETTING state
remaining_secs = calculate_remaining_seconds()
send_phase_update("BETTING", draw_number, remaining_secs)

# Main loop
running = True
while running:
    dt = clock.tick(FPS)

    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_ESCAPE:
                running = False
            elif event.key == pygame.K_SPACE and game_phase == BETTING:
                # Skip betting and close immediately
                game_phase = CLOSING
                phase_timer = 0
                remaining_secs = calculate_remaining_seconds()
                send_phase_update("CLOSING", draw_number, remaining_secs, 
                                  "Bets are now closing!", "warning")
            elif event.key == pygame.K_SPACE and game_phase == FINALIZED:
                # Skip to next BETTING phase for testing the loop
                draw_number += 1
                reset_draw()
                game_phase = BETTING
                phase_timer = 0
                remaining_secs = calculate_remaining_seconds()
                send_phase_update("BETTING", draw_number, remaining_secs)

    # ---- Update Phase Timer ----
    phase_timer += dt

    # Phase transitions
    if game_phase == BETTING and phase_timer >= BETTING_DURATION:
        game_phase = CLOSING
        phase_timer = 0
        remaining_secs = calculate_remaining_seconds()
        send_phase_update("CLOSING", draw_number, remaining_secs,
                          "Bets are now closing!", "warning")
        
    elif game_phase == CLOSING and phase_timer >= CLOSING_DURATION:
        game_phase = DRAWING
        phase_timer = 0
        reset_draw()  # Clear the board right before the new numbers draw
        # Lock bets - send final closing notification
        send_phase_update("DRAWING", draw_number, 0,
                          "Bets are closed! Drawing in progress...", "error")
        sent_closing_notification = True
        
    elif game_phase == FINALIZED and phase_timer >= RESULTS_DISPLAY_DURATION:
        # Add the last draw's numbers to history before looping to next round
        pick_history.extend(revealed_numbers)
        # Loop back to BETTING for the next round
        draw_number += 1
        game_phase = BETTING
        phase_timer = 0
        remaining_secs = calculate_remaining_seconds()
        send_phase_update("BETTING", draw_number, remaining_secs)

    # ---- Send periodic state updates during BETTING/CLOSING phases ----
    if game_phase == BETTING or game_phase == CLOSING:
        remaining_secs = calculate_remaining_seconds()
        
        # Send countdown update every ~1 second (roughly every 60 frames)
        if int(phase_timer / 1000) != int((phase_timer - dt) / 1000):
            send_phase_update(
                "BETTING" if game_phase == BETTING else "CLOSING",
                draw_number,
                remaining_secs
            )
        
        # At exactly 10 seconds remaining, send warning notification
        if remaining_secs == 10 and not sent_10s_warning and game_phase != CLOSING:
            sent_10s_warning = True
            send_phase_update("BETTING", draw_number, remaining_secs,
                              "Bets closing in 10 seconds!", "warning")
        
        # At exactly 5 seconds remaining (start of CLOSING phase), lock bets
        if game_phase == CLOSING and not sent_closing_notification:
            sent_closing_notification = True
            if remaining_secs <= 2:
                send_phase_update("CLOSING", draw_number, remaining_secs,
                                  "Bets are locked! No more bets.", "error")
            else:
                send_phase_update("CLOSING", draw_number, remaining_secs,
                                  "Bets closing soon!", "warning")
        
        # At exactly 2 seconds remaining, send final lock notification
        if remaining_secs == 2 and game_phase == CLOSING:
            send_phase_update("CLOSING", draw_number, remaining_secs,
                              "Bets are locked! No more bets.", "error")

    # ---- Update Ball Animation ----
    if game_phase == DRAWING and not all_done and current_reveal_index < len(picked_numbers):
        current_num = picked_numbers[current_reveal_index]

        if ball_state == BALL_DROPPING:
            # Apply gravity
            ball_vy += GRAVITY * dt
            ball_y += ball_vy * dt

            # Check for ground bounce
            if ball_y >= GROUND_Y:
                ball_y = GROUND_Y
                ball_vy = -ball_vy * BOUNCE_DAMPING
                bounce_count += 1

                # After exactly MAX_BOUNCES bounces, stop and start flashing
                if bounce_count >= MAX_BOUNCES:
                    ball_vy = 0
                    ball_state = BALL_FLASHING
                    flash_count = 0
                    flash_visible = True
                    flash_timer = 0

        elif ball_state == BALL_FLASHING:
            # Flash the yellow tile
            flash_timer += dt
            if flash_timer >= FLASH_INTERVAL:
                flash_timer = 0
                flash_visible = not flash_visible
                flash_count += 1

                if flash_count >= FLASH_CYCLES * 2:
                    # Flashing done, add to revealed and start zooming
                    revealed_numbers.append(current_num)
                    ball_state = BALL_ZOOMING

        elif ball_state == BALL_ZOOMING:
            # Zoom straight up
            ball_vy = -ZOOM_SPEED
            ball_y += ball_vy * dt

            # When fully off screen, move to next number
            if ball_y < -BALL_H:
                current_reveal_index += 1
                if current_reveal_index >= len(picked_numbers):
                    all_done = True
                    game_phase = FINALIZED
                    phase_timer = 0
                    # Send the finalized state with drawn numbers
                    send_phase_update("FINALIZED", draw_number, 0,
                                      "Draw results are final!", "success",
                                      drawn=sorted(revealed_numbers))
                else:
                    start_next_ball()

    # ---- Draw ----
    screen.blit(background_img, (0, 0))

    # Draw all fully revealed numbers (static, full opacity)
    for num in revealed_numbers:
        x, y = keno_coords[num]
        screen.blit(yellow_number_img, (x, y))

        # Black number text centered on the overlay
        label = font.render(str(num), True, BLACK)
        label_rect = label.get_rect(center=(x + OVERLAY_W // 2, y + OVERLAY_H // 2))
        screen.blit(label, label_rect)

    # Draw the current ball animation (only during DRAWING phase)
    if game_phase == DRAWING and not all_done and current_reveal_index < len(picked_numbers):
        current_num = picked_numbers[current_reveal_index]

        # Draw the ball
        ball_draw_x = BALL_X - BALL_W // 2
        ball_draw_y = int(ball_y) - BALL_H // 2
        screen.blit(ball_surfaces[current_num], (ball_draw_x, ball_draw_y))

        # Draw the flashing yellow tile (during FLASHING state)
        if ball_state == BALL_FLASHING and flash_visible:
            x, y = keno_coords[current_num]
            screen.blit(yellow_number_img, (x, y))
            label = font.render(str(current_num), True, BLACK)
            label_rect = label.get_rect(center=(x + OVERLAY_W // 2, y + OVERLAY_H // 2))
            screen.blit(label, label_rect)

    # ---- HUD ----

    # 1) TOP RIGHT: NEXT DRAW countdown (1500, 22)
    if game_phase == DRAWING:
        next_draw_text = "NEXT DRAW: NOW"
        next_draw_color = RED
        next_draw_surf = hud_font.render(next_draw_text, True, next_draw_color)
        screen.blit(next_draw_surf, (1500, 22))
    else:
        # Calculate exact milliseconds until the next DRAWING phase begins
        if game_phase == FINALIZED:
            # During final results display, show the full interval until next draw
            remaining_ms = NEXT_DRAW_INTERVAL
        elif game_phase == BETTING:
            remaining_ms = (BETTING_DURATION - phase_timer) + CLOSING_DURATION
        elif game_phase == CLOSING:
            remaining_ms = (CLOSING_DURATION - phase_timer)
        else:
            remaining_ms = 0
            
        remaining_secs = max(0, int(remaining_ms / 1000))
        next_draw_text = f"NEXT DRAW: {remaining_secs} seconds"
        next_draw_surf = hud_font.render(next_draw_text, True, WHITE)
        screen.blit(next_draw_surf, (1500, 22))

    # 2) BOTTOM CENTER: DRAWING / DRAW RESULTS FINALIZED (710, 1020)
    bottom_text = ""
    bottom_color = WHITE
    if game_phase == DRAWING:
        bottom_text = "DRAWING"
        bottom_color = WHITE
    elif game_phase == FINALIZED or all_done:
        bottom_text = "DRAW RESULTS FINALIZED"
        bottom_color = GOLD
    if bottom_text:
        # Flash the finalized text like a yellow brick
        actual_color = bottom_color
        if game_phase == FINALIZED or all_done:
            finalized_flash_timer += dt
            if finalized_flash_timer >= FINALIZED_FLASH_INTERVAL:
                finalized_flash_timer = 0
                finalized_flash_visible = not finalized_flash_visible
            if finalized_flash_visible:
                actual_color = YELLOW
            else:
                actual_color = GOLD
        bottom_surf = hud_font.render(bottom_text, True, actual_color)
        screen.blit(bottom_surf, (710, 1020))

    # ---- Draw Stats (drawn / odd/even / top/bottom) ----
    drawn_count = len(revealed_numbers)
    odd_count = sum(1 for n in revealed_numbers if n % 2 == 1) if revealed_numbers else 0
    even_count = sum(1 for n in revealed_numbers if n % 2 == 0) if revealed_numbers else 0
    top_count = sum(1 for n in revealed_numbers if n <= 20) if revealed_numbers else 0
    bottom_count = sum(1 for n in revealed_numbers if n >= 21) if revealed_numbers else 0
    stats_x = 1565
    stats_y_start = 375
    stats_line_height = 35
    drawn_surf = hud_font.render(f"DRAWN:{drawn_count}", True, GOLD)
    odd_surf = hud_font.render(f"ODD:{odd_count}", True, GOLD)
    even_surf = hud_font.render(f"EVEN:{even_count}", True, GOLD)
    top_surf = hud_font.render(f"TOP:{top_count}", True, GOLD)
    bottom_surf = hud_font.render(f"BOTTOM:{bottom_count}", True, GOLD)
    screen.blit(drawn_surf, (stats_x, stats_y_start))
    screen.blit(odd_surf, (stats_x, stats_y_start + stats_line_height))
    screen.blit(even_surf, (stats_x, stats_y_start + stats_line_height * 2))
    screen.blit(top_surf, (stats_x, stats_y_start + stats_line_height * 3))
    screen.blit(bottom_surf, (stats_x, stats_y_start + stats_line_height * 4))

    # 3) TOP CENTER: DRAW #n + phase status (745, 100)
    # Phase text and color
    if game_phase == BETTING:
        phase_text = "ACCEPTING BETS"
        phase_color = YELLOW
    elif game_phase == CLOSING:
        phase_text = "BETTING CLOSING SOON"
        phase_color = RED
    elif game_phase == DRAWING:
        phase_text = "GAME IN PROGRESS"
        phase_color = WHITE
    elif game_phase == FINALIZED:
        phase_text = "GAME FINAL"
        phase_color = GOLD
    else:
        phase_text = ""
        phase_color = WHITE

    draw_info_text = f"DRAW #{draw_number}  {phase_text}"
    draw_info_surf = big_font.render(draw_info_text, True, phase_color)
    screen.blit(draw_info_surf, (745, 100))

    # ---- 4) TOP LEFT: Top 20 Numbers (30, 110) ----
    top20_data = get_top_20()
    top20_title_surf = top20_title_font.render("Top 20 Numbers", True, GOLD)
    screen.blit(top20_title_surf, (30, 110))

    if top20_data:
        # Display in a table format: NUMBER | HITS
        row_height = 28
        title_bar_offset = 40
        col1_x = 30
        col2_x = 190

        # Header
        header_y = 110 + title_bar_offset
        header_num_surf = top20_font.render("NUMBER", True, GOLD)
        header_hits_surf = top20_font.render("HITS", True, GOLD)
        screen.blit(header_num_surf, (col1_x, header_y))
        screen.blit(header_hits_surf, (col2_x, header_y))

        # Separator line
        sep_y = header_y + 22
        pygame.draw.line(screen, GOLD, (col1_x, sep_y), (col1_x + 80, sep_y), 1)
        pygame.draw.line(screen, GOLD, (col2_x, sep_y), (col2_x + 60, sep_y), 1)

        for i, (num, count) in enumerate(top20_data):
            y_pos = sep_y + 8 + (i * row_height)

            text = f"Spot {num:02d}"
            hits_text = f"{count}x"
            color = GOLD if num in revealed_numbers else WHITE
            num_surf = top20_font.render(text, True, color)
            hits_surf = top20_font.render(hits_text, True, color)
            screen.blit(num_surf, (col1_x, y_pos))
            screen.blit(hits_surf, (col2_x, y_pos))
    else:
        no_data_surf = top20_font.render("No draws yet", True, WHITE)
        screen.blit(no_data_surf, (30, 160))

    pygame.display.flip()

pygame.quit()
sys.exit()