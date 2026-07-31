import os
import random
import pygame
import sys
import math
import json
import threading
import urllib.request
import urllib.error

# ---- Server communication ----
import server_config

SERVER_STATE_UPDATE_URL = server_config.get_endpoint("/api/big-wheel-6/state-update")

# ---- Load game config from YAML ----
_bw_config = server_config.load_game_config("big_wheel_6")
COUNTDOWN_DURATION = _bw_config.get("countdown_duration", 15)       # seconds
SPIN_DURATION = _bw_config.get("spin_duration", 5.0)                # seconds
RESULT_DISPLAY_DURATION = _bw_config.get("result_display_duration", 10)  # seconds
DISPLAY_WIDTH = _bw_config.get("display_width", 1280)
DISPLAY_HEIGHT = _bw_config.get("display_height", 720)
FPS = _bw_config.get("fps", 30)


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
        except (urllib.error.URLError, urllib.error.HTTPError, Exception):
            pass
    
    threading.Thread(target=_send, daemon=True).start()


def send_phase_update(phase, countdown_secs, message=None, message_type=None, result=None, bets_locked=None):
    """Helper to send a structured state update."""
    state = {
        "phase": phase,
        "countdownSeconds": countdown_secs,
    }
    if message:
        state["message"] = message
        state["messageType"] = message_type or "info"
    if result is not None:
        state["result"] = result
    if bets_locked is not None:
        state["betsLocked"] = bets_locked
    send_state_update(state)


def run_wheel_test():
    pygame.init()
    
    # Configuration
    debug_overlays = False   # Set to True to show green axis lines and center dot
    assets_dir = "assets"
    
    screen = pygame.display.set_mode((DISPLAY_WIDTH, DISPLAY_HEIGHT))
    pygame.display.set_caption("Casino Wheel Physics - Automated Game Loop")
    clock = pygame.time.Clock()
    fps = FPS
    
    try:
        font_small = pygame.font.SysFont(None, 32)
        font_large = pygame.font.SysFont(None, 70)
        font_huge = pygame.font.SysFont(None, 120)
        font_payout = pygame.font.SysFont(None, 130)
        font_payout_info = pygame.font.SysFont(None, 50)
    except Exception:
        font_small = pygame.font.Font(None, 32)
        font_large = pygame.font.Font(None, 70)
        font_huge = pygame.font.Font(None, 120)
        font_payout = pygame.font.Font(None, 130)
        font_payout_info = pygame.font.Font(None, 50)
    
    # 1. Load Assets
    script_dir = os.path.dirname(os.path.abspath(__file__))
    assets_dir_full = os.path.join(script_dir, assets_dir)
    try:
        back_path = os.path.join(assets_dir_full, "bw6_back.png")
        wheel_path = os.path.join(assets_dir_full, "bw6_wheel.png")
        
        bg_orig = pygame.image.load(back_path).convert()
        bg_orig = pygame.transform.smoothscale(bg_orig, (1000, 1000))
        wheel_orig = pygame.image.load(wheel_path).convert_alpha()
        
    except pygame.error as e:
        print(f"Error loading assets: {e}")
        pygame.quit()
        sys.exit()

    # --- PRE-SCALE WHEEL ONCE ---
    bg_rect_temp = bg_orig.get_rect()
    scale_multiplier = 0.800
    target_wheel_width = int(bg_rect_temp.width * scale_multiplier)
    target_wheel_height = int(bg_rect_temp.height * scale_multiplier)
    
    wheel_scaled = pygame.transform.smoothscale(wheel_orig, (target_wheel_width, target_wheel_height))
    print(f"Wheel image pre-scaled once to: {wheel_scaled.get_width()} x {wheel_scaled.get_height()}")

    # --- OVERLAY SETUP ---
    overlay = pygame.Surface((DISPLAY_WIDTH, DISPLAY_HEIGHT), pygame.SRCALPHA)
    overlay.fill((0, 0, 0, 127))  # 50% Black (127 out of 255 alpha)

    angle = 0.0
    current_speed = 0.0
    
    # State Machine Variables
    spin_state = 'COUNTDOWN'
    state_timer = float(COUNTDOWN_DURATION)
    spin_duration_seconds = SPIN_DURATION
    spin_timer = 0.0
    
    anticipation_counter = 0
    start_spin_angle = 0.0
    target_stop_angle = 0.0
    selected_wedge = None
    bet_credits = 5

    stopped_readout_text = "Waiting..."
    
    # Debug override: set a specific wheel value for the next spin
    # Key mapping: 1->"1", 2->"2", 3->"20", 4->"40", 5->"5", 0->"0" (house)
    debug_next_value = None

    # --- 56-WEDGE LOOKUP TABLE ---
    deg_step = 360.0 / 56.0
    raw_wheel_values = [
        "0", "1", "1", "5", "1", "40", "2", "1", "2", "1", "10", "2", "1", "5", "1", "2", "1", "5", "2", "1", "20", "1", "2", "1", "10", "1", "2", "1",
        "0", "1", "2", "1", "2", "1", "10", "1", "2", "1", "5", "1", "2", "1", "20", "1", "2", "1", "2", "1", "5", "1", "2", "10", "1", "5", "1", "2"
    ]
    
    wheel_wedges = []
    for i, val in enumerate(raw_wheel_values):
        target_angle = (360.0 - (i * deg_step)) % 360.0
        wheel_wedges.append({
            "index": i,
            "angle": round(target_angle, 2),
            "value": val
        })

    # --- CALIBRATION VARIABLES ---
    screen_center_x = DISPLAY_WIDTH // 2
    bg_x = screen_center_x
    bg_y = 450
    
    wheel_offset_x = 3
    wheel_offset_y = -27  

    print("\n--- AUTOMATED LOOP ACTIVE ---")
    print("Press [SPACE] to skip the countdown and spin immediately.")
    print("Press [ESC] to exit.")
    print("DEBUG: Press [0]-[5] during countdown to force next result:")
    print("  1=1, 2=2, 3=20, 4=40, 5=5, 0=House wins")
    print("  (No key = random spin as normal)\n")
    
    # Send initial BETTING state
    send_phase_update("BETTING", COUNTDOWN_DURATION)
    
    running = True
    while running:
        dt = 1.0 / fps
        
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    running = False
                elif event.key == pygame.K_SPACE:
                    if spin_state == 'COUNTDOWN':
                        # Send state update: betting closed with bets locked
                        sec_left = max(0, int(math.ceil(state_timer)))
                        send_phase_update("BETTING", sec_left, "Betting closed!", "error", bets_locked=True)
                        state_timer = 0.0 # Force skip countdown
                elif event.key in (pygame.K_0, pygame.K_1, pygame.K_2, pygame.K_3, pygame.K_4, pygame.K_5):
                    # Debug override: force the next spin to land on a specific value
                    debug_key_map = {
                        pygame.K_0: "0",
                        pygame.K_1: "1",
                        pygame.K_2: "2",
                        pygame.K_3: "20",
                        pygame.K_4: "40",
                        pygame.K_5: "5",
                    }
                    debug_next_value = debug_key_map[event.key]
                    print(f"DEBUG: Next spin forced to value '{debug_next_value}'")
                
        # --- PHYSICS & GAME LOOP STATE MACHINE ---
        if spin_state == 'COUNTDOWN':
            state_timer -= dt
            # Send countdown updates every second
            if int(state_timer) != int(state_timer + dt):
                send_phase_update("BETTING", max(0, int(math.ceil(state_timer))))
            # 10-second warning
            if int(math.ceil(state_timer)) == 10:
                send_phase_update("BETTING", 10, "Betting closing in 10 seconds!", "warning")
            # 5-second warning
            if int(math.ceil(state_timer)) == 5:
                send_phase_update("BETTING", 5, "Betting closing soon!", "warning")
            # 2-second lock
            if int(math.ceil(state_timer)) == 2:
                send_phase_update("BETTING", 2, "Bets are locked! No more bets.", "error")
            if state_timer <= 0:
                # Trigger Spin
                if debug_next_value is not None:
                    candidates = [w for w in wheel_wedges if w["value"] == debug_next_value]
                    if candidates:
                        selected_wedge = random.choice(candidates)
                        print(f"DEBUG OVERRIDE: Forcing value '{debug_next_value}' (index {selected_wedge['index']})")
                    else:
                        selected_wedge = random.choice(wheel_wedges)
                        print(f"DEBUG OVERRIDE: No wedge with value '{debug_next_value}', using random")
                    debug_next_value = None
                else:
                    selected_wedge = random.choice(wheel_wedges)
                full_rotations = 5 * 360.0
                current_normalized = angle % 360.0
                forward_distance = (selected_wedge["angle"] - current_normalized) % 360.0
                if forward_distance < 1.0:
                    forward_distance += 360.0
                    
                start_spin_angle = angle
                target_stop_angle = angle + full_rotations + forward_distance
                
                spin_timer = 0.0
                spin_state = 'ANTICIPATION'
                anticipation_counter = 0
                stopped_readout_text = "Spinning..."
                print(f"Spin triggered! Target Index: {selected_wedge['index']} ({selected_wedge['value']})")
                send_phase_update("SPINNING", 0, "Spinning...", "info")
                
        elif spin_state == 'ANTICIPATION':
            current_speed = -0.6
            angle = (angle + current_speed) % 360
            anticipation_counter += 1
            if anticipation_counter > 12:  
                spin_state = 'SPINNING_TARGET'
                spin_timer = 0.0
                print("Target coasting sequence started...")
                
        elif spin_state == 'SPINNING_TARGET':
            spin_timer += dt
            progress = spin_timer / spin_duration_seconds
            
            if progress >= 1.0:
                angle = target_stop_angle
                current_speed = 0.0
                
                # Setup Result State
                spin_state = 'RESULT'
                state_timer = float(RESULT_DISPLAY_DURATION)
                
                stopped_readout_text = [
                    f"Wedge Index: {selected_wedge['index']}",
                    f"Angle: {selected_wedge['angle']:.2f}°",
                    f"Value: {selected_wedge['value']}"
                ]
                print(f"Wheel stopped! Value: {selected_wedge['value']}")
                send_phase_update("RESULT", RESULT_DISPLAY_DURATION,
                                  f"Winner: {selected_wedge['value']}", "success",
                                  result=selected_wedge['value'])
            else:
                easing = 1.0 - pow(1.0 - progress, 3)
                angle = start_spin_angle + (target_stop_angle - start_spin_angle) * easing
                
        elif spin_state == 'RESULT':
            state_timer -= dt
            if int(state_timer) != int(state_timer + dt):
                send_phase_update("RESULT", max(0, int(math.ceil(state_timer))))
            if state_timer <= 0:
                spin_state = 'COUNTDOWN'
                state_timer = float(COUNTDOWN_DURATION)
                send_phase_update("BETTING", COUNTDOWN_DURATION)
        
        # --- BACKGROUND POSITION SETUP ---
        bg_rect = bg_orig.get_rect()
        bg_rect.center = (bg_x, bg_y)
        
        # --- FAST ROTATION FROM PRE-SCALED SURFACE ---
        rotated_wheel = pygame.transform.rotate(wheel_scaled, -angle)
        
        # Re-incorporate calibration offsets into the world center vector
        wheel_world_center = pygame.math.Vector2(screen_center_x + wheel_offset_x, bg_y + wheel_offset_y)
        rw_rect = rotated_wheel.get_rect(center=wheel_world_center)
        
        # --- CROP & DRAW LOGIC ---
        canvas = pygame.Surface((DISPLAY_WIDTH, DISPLAY_HEIGHT), pygame.SRCALPHA)
        
        canvas.blit(bg_orig, bg_rect.topleft)
        canvas.blit(rotated_wheel, rw_rect.topleft)
        
        # --- AXIS OVERLAYS (DIAGNOSTIC) ---
        if debug_overlays:
            pygame.draw.line(canvas, (0, 255, 0, 180), (wheel_world_center.x, 0), (wheel_world_center.x, DISPLAY_HEIGHT), 1)
            pygame.draw.line(canvas, (0, 255, 0, 180), (0, wheel_world_center.y), (DISPLAY_WIDTH, wheel_world_center.y), 1)
            pygame.draw.circle(canvas, (255, 255, 0), (int(wheel_world_center.x), int(wheel_world_center.y)), 3)

        # Apply black overlay on canvas BEFORE text, so text renders on top of it
        if spin_state in ['COUNTDOWN', 'RESULT']:
            canvas.blit(overlay, (0, 0))

        # --- RENDER CENTERED TEXT (on top of overlay) ---
        if spin_state in ['COUNTDOWN', 'RESULT']:
            
            if spin_state == 'COUNTDOWN':
                sec_left = max(0, int(math.ceil(state_timer)))
                # Always show white countdown
                t1 = font_huge.render(f"{sec_left} seconds", True, (255, 255, 255))
                t2 = font_large.render("until next game", True, (255, 255, 255))
                
                # Center text on screen
                t1_rect = t1.get_rect(center=(DISPLAY_WIDTH // 2, DISPLAY_HEIGHT // 2 - 40))
                t2_rect = t2.get_rect(center=(DISPLAY_WIDTH // 2, DISPLAY_HEIGHT // 2 + 40))
                
                canvas.blit(t1, t1_rect)
                canvas.blit(t2, t2_rect)
                
                # Show betting status
                if 3 <= sec_left <= 5:
                    t3 = font_large.render("Betting closing soon", True, (255, 255, 0))  # Yellow
                    t3_rect = t3.get_rect(center=(DISPLAY_WIDTH // 2, DISPLAY_HEIGHT // 2 + 90))
                    canvas.blit(t3, t3_rect)
                elif sec_left == 2:
                    t3 = font_large.render("Betting closed", True, (255, 0, 0))  # Red
                    t3_rect = t3.get_rect(center=(DISPLAY_WIDTH // 2, DISPLAY_HEIGHT // 2 + 90))
                    canvas.blit(t3, t3_rect)
                elif sec_left == 1:
                    t3 = font_large.render("Betting closed", True, (255, 0, 0))  # Red
                    t3_rect = t3.get_rect(center=(DISPLAY_WIDTH // 2, DISPLAY_HEIGHT // 2 + 90))
                    canvas.blit(t3, t3_rect)
                else:
                    t3 = font_large.render("place your bets", True, (255, 255, 255))  # White
                    t3_rect = t3.get_rect(center=(DISPLAY_WIDTH // 2, DISPLAY_HEIGHT // 2 + 90))
                    canvas.blit(t3, t3_rect)
                
            elif spin_state == 'RESULT':
                if selected_wedge is None:
                    continue
                val = selected_wedge['value']
                
                if val == "0":
                    # House wins
                    t1 = font_huge.render("House Wins!", True, (255, 50, 50))  # Red
                    t2 = font_payout.render("All players lose this round", True, (255, 255, 255))  # White
                    t3 = font_large.render(f"Wheel landed on: {val}", True, (255, 215, 0))  # Gold
                    
                    t1_rect = t1.get_rect(center=(DISPLAY_WIDTH // 2, DISPLAY_HEIGHT // 2 - 90))
                    t2_rect = t2.get_rect(center=(DISPLAY_WIDTH // 2, DISPLAY_HEIGHT // 2 + 15))
                    t3_rect = t3.get_rect(center=(DISPLAY_WIDTH // 2, DISPLAY_HEIGHT // 2 + 90))
                    
                    canvas.blit(t1, t1_rect)
                    canvas.blit(t2, t2_rect)
                    canvas.blit(t3, t3_rect)
                else:
                    # Player wins! Show payout info
                    payout_mult = val
                    t1 = font_huge.render(f"WINNER: {val}!", True, (0, 255, 100))  # Green
                    t2 = font_payout.render(f"Pays {payout_mult}:1", True, (255, 215, 0))  # Gold
                    t3 = font_large.render(f"Wheel landed on: {val}", True, (255, 255, 255))  # White
                    
                    t1_rect = t1.get_rect(center=(DISPLAY_WIDTH // 2, DISPLAY_HEIGHT // 2 - 90))
                    t2_rect = t2.get_rect(center=(DISPLAY_WIDTH // 2, DISPLAY_HEIGHT // 2 + 15))
                    t3_rect = t3.get_rect(center=(DISPLAY_WIDTH // 2, DISPLAY_HEIGHT // 2 + 90))
                    
                    canvas.blit(t1, t1_rect)
                    canvas.blit(t2, t2_rect)
                    canvas.blit(t3, t3_rect)

        # --- DEBUG OVERRIDE INDICATOR (Top Left) ---
        if debug_next_value is not None:
            debug_text = font_large.render(f"DEBUG NEXT: {debug_next_value}", True, (255, 165, 0))
            canvas.blit(debug_text, (20, 20))

        # --- RENDER TABLE READOUT (Top Right) ---
        if spin_state == 'RESULT' and isinstance(stopped_readout_text, list):
            for i, line in enumerate(stopped_readout_text):
                text_surface = font_small.render(line, True, (255, 255, 255))
                canvas.blit(text_surface, (1600, 50 + (i * 35)))
        else:
            text_surface = font_small.render(stopped_readout_text if isinstance(stopped_readout_text, str) else "Waiting...", True, (255, 255, 255))
            canvas.blit(text_surface, (1600, 50))
        
        clip_rect = pygame.Rect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT)
        cropped_surface = canvas.subsurface(clip_rect)
        
        screen.fill((0, 0, 0))
        screen.blit(cropped_surface, (0, 0))
        
        pygame.display.flip()
        clock.tick(fps)
        
    pygame.quit()
    sys.exit()

if __name__ == "__main__":
    run_wheel_test()