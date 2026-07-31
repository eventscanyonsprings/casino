import pygame
import random
import os
import json
import threading
import urllib.request
import urllib.error

# ---- Server communication ----
import server_config

SERVER_STATE_UPDATE_URL = server_config.get_endpoint("/api/chicken-race/state-update")

# ---- Load game config from YAML ----
_cr_config = server_config.load_game_config("chicken_race")
MOVE_DELAY = _cr_config.get("move_delay", 1.0)           # seconds
ANIMATION_DURATION = _cr_config.get("animation_duration", 0.3)  # seconds
POST_RACE_DELAY = _cr_config.get("post_race_delay", 30)    # seconds
TRACK_LENGTH = _cr_config.get("track_length", 1800)
NUM_SEGMENTS = _cr_config.get("num_segments", 8)
SCREEN_WIDTH = _cr_config.get("screen_width", 1920)
SCREEN_HEIGHT = _cr_config.get("screen_height", 1080)
FPS = _cr_config.get("fps", 60)

CHICKEN_SIZE = (200, 201)

CHICKEN_NAMES = [
    "Cluck Norris",
    "Beakoncé",
    "Chick Jagger",
    "Yolko Ono",
    "Egg Sheeran"
]

# --- UI Design & Theme ---
UI_COLORS = {
    "text_primary": (255, 255, 255),  # White
    "text_accent": (255, 255, 0),    # Yellow
    "timer_warning": (255, 0, 0),    # Red
    "overlay": (0, 0, 0)             # Black
}

NAME_Y_OFFSET = 80 
OVERLAY_OPACITY = 128 

UI_BOTTOM_ANCHOR = SCREEN_HEIGHT - 100 # Central point for the bottom UI

# --- Starting Positions ---
START_X_POS = -100
CHICKEN_1_Y = 280
CHICKEN_2_Y = 420
CHICKEN_3_Y = 560
CHICKEN_4_Y = 700
CHICKEN_5_Y = 840

FINISH_LINE_X = START_X_POS + TRACK_LENGTH

# Configurable trigger points for mid-race commentary
HALF_WAY_X = START_X_POS + (TRACK_LENGTH * 0.45)
FINAL_STRETCH_X = START_X_POS + (TRACK_LENGTH * 0.70)

# Calculation: (1800 / 20) / 10 = 9 pixels per unit.
STEP_UNIT = (TRACK_LENGTH / NUM_SEGMENTS) / 10


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


def send_phase_update(phase, countdown_secs, message=None, message_type=None, result=None):
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
    send_state_update(state)


# Mid-race commentary lines (sent to web client as notifications / shown on screen)
START_COMMENTARY = [
    "They're OFF!",
    "And the chickens are running!",
    "Here we go! The race is underway!"
]

HALF_WAY_COMMENTARY = [
    "We're at the halfway mark!",
    "It's a tight race in the middle!",
    "Halfway there - anything can happen!"
]

FINAL_STRETCH_COMMENTARY = [
    "Down the final stretch!",
    "The chickens are sprinting to the finish!",
    "Who's going to take home the prize?"
]


class Chicken:
    def __init__(self, number, start_x, start_y, assets_path):
        self.number = number
        self.x = start_x
        self.target_x = start_x
        self.speed = 0  # Pixels per millisecond
        self.y = start_y
        
        # Load image
        img_path = os.path.join(assets_path, f"chicken_{number}.png")
        try:
            self.image = pygame.image.load(img_path).convert_alpha()
            self.image = pygame.transform.scale(self.image, CHICKEN_SIZE)
        except pygame.error:
            # Fallback if images aren't in the assets folder yet
            self.image = pygame.Surface(CHICKEN_SIZE)
            self.image.fill((random.randint(50, 200), 50, 50))
            
    def move(self):
        """Calculates the next target position for a smooth 'hop'."""
        # Move only if the "nose" of the chicken hasn't crossed the finish line
        if self.target_x < FINISH_LINE_X:
            # Pick a random number between 1 and 10
            random_roll = random.randint(1, 10)
            distance = random_roll * STEP_UNIT
            self.target_x += distance
            # Calculate speed required to reach target_x within the ANIMATION_DURATION
            self.speed = (self.target_x - self.x) / (ANIMATION_DURATION * 1000)
            return True
        return False

    def update(self, dt):
        """Moves the chicken smoothly towards target_x based on delta time."""
        if self.x < self.target_x:
            self.x += self.speed * dt
            if self.x > self.target_x:
                self.x = self.target_x

    def draw(self, screen):
        screen.blit(self.image, (self.x, self.y))


def countdown_display_text(seconds_left):
    """Return the betting status text for the scoreboard display."""
    if seconds_left <= 2:
        return "Bets are locked!"
    return "Place your Bets"


def main():
    pygame.init()
    pygame.mixer.init()
    screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
    pygame.display.set_caption("Chicken Race")
    
    # Path to assets (assumes assets folder is inside scripts)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    assets_dir = os.path.join(script_dir, "assets")
    
    # Load background
    bg_path = os.path.join(assets_dir, "chicken_track.png")
    try:
        background = pygame.image.load(bg_path).convert()
        background = pygame.transform.scale(background, (SCREEN_WIDTH, SCREEN_HEIGHT))
    except pygame.error:
        background = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT))
        background.fill((100, 150, 100)) # Green fallback

    # Create overlay for post-race/betting screen
    overlay = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
    overlay.fill((0, 0, 0, OVERLAY_OPACITY))

    # Create 5 chickens
    # 1 is top, 5 is bottom. We spread them across the screen height.
    chickens = []

    # Store individual coordinates in a list to simplify initialization
    start_positions = [
        (START_X_POS, CHICKEN_1_Y),
        (START_X_POS, CHICKEN_2_Y),
        (START_X_POS, CHICKEN_3_Y),
        (START_X_POS, CHICKEN_4_Y),
        (START_X_POS, CHICKEN_5_Y)
    ]
    
    for i in range(1, 6):
        x_pos, y_pos = start_positions[i-1]
        chickens.append(Chicken(i, x_pos, y_pos, assets_dir))

    # Load race sounds
    call_to_post_path = os.path.join(assets_dir, "call_to_post.wav")
    call_to_post_sound = None
    if os.path.exists(call_to_post_path):
        try:
            call_to_post_sound = pygame.mixer.Sound(call_to_post_path)
        except pygame.error:
            pass

    theyre_off_sounds = []
    half_way_sounds = []
    final_stretch_sounds = []
    if os.path.exists(assets_dir):
        for file_name in os.listdir(assets_dir):
            if not file_name.endswith(".wav"):
                continue
            
            try:
                full_path = os.path.join(assets_dir, file_name)
                if file_name.startswith("theyre_off_"):
                    sound = pygame.mixer.Sound(full_path)
                    theyre_off_sounds.append(sound)
                elif file_name.startswith("half_way_"):
                    sound = pygame.mixer.Sound(full_path)
                    half_way_sounds.append(sound)
                elif file_name.startswith("final_stretch_"):
                    sound = pygame.mixer.Sound(full_path)
                    final_stretch_sounds.append(sound)
            except pygame.error:
                pass

    winner_sounds = {}
    for i in range(1, 6):
        winner_sound_path = os.path.join(assets_dir, f"winner_is_{i}.wav")
        if os.path.exists(winner_sound_path):
            try:
                winner_sounds[i] = pygame.mixer.Sound(winner_sound_path)
            except pygame.error:
                pass

    clock = pygame.time.Clock()
    racing = False
    is_preparing = False
    off_sound_played = False
    half_way_played = False
    final_stretch_played = False
    is_counting_down = False          # Start with manual space-bar start
    countdown_start_time = 0
    call_to_post_channel = None
    last_move_time = 0
    winner = None
    font = pygame.font.SysFont("Arial", 120, bold=True)
    name_font = pygame.font.SysFont("Arial", 45, bold=True)
    commentary_font = pygame.font.SysFont("Arial", 60, bold=True)

    # Current on-screen dialog message and when it was shown
    dialog_text = ""
    dialog_start_time = 0
    DIALOG_DURATION = 4000  # milliseconds

    # Send initial BETTING state
    send_phase_update("BETTING", POST_RACE_DELAY, "Press SPACE to start the race!", "info")
    # Show initial dialog text on the big screen
    dialog_text = "Press SPACE to start the race!"
    dialog_start_time = pygame.time.get_ticks()

    running = True
    while running:
        # Get time elapsed since last frame in milliseconds
        dt = clock.tick(FPS)

        # 1. Event Handling
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    running = False
                if event.key == pygame.K_SPACE and not racing and not is_preparing and not is_counting_down:
                    # Start the race (either after a result, or the very first time)
                    winner = None
                    is_counting_down = False
                    off_sound_played = False
                    half_way_played = False
                    final_stretch_played = False
                    for chicken in chickens:
                        chicken.x = START_X_POS
                        chicken.target_x = START_X_POS
                    
                    if call_to_post_sound:
                        call_to_post_channel = call_to_post_sound.play()
                        is_preparing = True
                        dialog_text = "And they're at the post..."
                        dialog_start_time = pygame.time.get_ticks()
                        send_phase_update("BETTING", POST_RACE_DELAY,
                                          "They're at the post! Place your bets!", "info")
                    else:
                        racing = True
                        last_move_time = pygame.time.get_ticks()
                        dialog_text = random.choice(START_COMMENTARY)
                        dialog_start_time = pygame.time.get_ticks()
                        send_phase_update("RACING", None,
                                          dialog_text, "info")

        # 2. Race Logic (Simultaneous movement)
        if is_preparing:
            # Check if the "Call to Post" sound has finished playing
            if not call_to_post_channel or not call_to_post_channel.get_busy():
                is_preparing = False
                racing = True
                # Reset timer and trigger the first movement immediately
                last_move_time = pygame.time.get_ticks() - (MOVE_DELAY * 1000)
                # Betting is now locked - send RACING phase
                dialog_text = random.choice(START_COMMENTARY)
                dialog_start_time = pygame.time.get_ticks()
                send_phase_update("RACING", None, dialog_text, "info")

        if racing:
            current_time = pygame.time.get_ticks()
            
            # Every MOVE_DELAY, trigger the next destination for all chickens
            if current_time - last_move_time >= (MOVE_DELAY * 1000):
                if not off_sound_played and theyre_off_sounds:
                    random.choice(theyre_off_sounds).play()
                    off_sound_played = True

                for chicken in chickens:
                    chicken.move()
                last_move_time = current_time

            # Smoothly update visual positions every frame
            for chicken in chickens:
                chicken.update(dt)
            
            # Trigger mid-race sounds based on position
            if not half_way_played and half_way_sounds:
                if any(c.x >= HALF_WAY_X for c in chickens):
                    random.choice(half_way_sounds).play()
                    half_way_played = True
                    dialog_text = random.choice(HALF_WAY_COMMENTARY)
                    dialog_start_time = pygame.time.get_ticks()
                    send_phase_update("RACING", None, dialog_text, "info")

            if not final_stretch_played and final_stretch_sounds:
                if any(c.x >= FINAL_STRETCH_X for c in chickens):
                    random.choice(final_stretch_sounds).play()
                    final_stretch_played = True
                    dialog_text = random.choice(FINAL_STRETCH_COMMENTARY)
                    dialog_start_time = pygame.time.get_ticks()
                    send_phase_update("RACING", None, dialog_text, "info")

            # Check for winners based on visual crossing
            finishers = [c for c in chickens if c.x >= FINISH_LINE_X]
            if finishers:
                winner = max(finishers, key=lambda c: c.x)
                racing = False
                is_counting_down = True
                countdown_start_time = pygame.time.get_ticks()
                if winner.number in winner_sounds:
                    winner_sounds[winner.number].play()
                dialog_text = f"{CHICKEN_NAMES[winner.number - 1]} wins!"
                dialog_start_time = pygame.time.get_ticks()
                send_phase_update("RESULT", POST_RACE_DELAY,
                                  f"Chicken {winner.number} wins!", "success",
                                  result=winner.number)

        # 3. Countdown Logic for Endless Loop
        if is_counting_down:
            current_ticks = pygame.time.get_ticks()
            elapsed_seconds = (current_ticks - countdown_start_time) // 1000
            seconds_left = max(0, POST_RACE_DELAY - elapsed_seconds)

            # Send phase updates during countdown
            if seconds_left == 10:
                send_phase_update("BETTING", seconds_left, "Betting closing in 10 seconds!", "warning")
                dialog_text = "Betting closes in 10 seconds!"
                dialog_start_time = pygame.time.get_ticks()
            elif seconds_left == 5:
                send_phase_update("BETTING", seconds_left, "Betting closing soon!", "warning")
                dialog_text = "Betting closes in 5 seconds!"
                dialog_start_time = pygame.time.get_ticks()
            elif seconds_left == 2:
                send_phase_update("BETTING", seconds_left, "Bets are locked! No more bets.", "error")
                dialog_text = "Bets are LOCKED!"
                dialog_start_time = pygame.time.get_ticks()
            elif seconds_left > 0 and seconds_left % 5 == 0:
                send_phase_update("BETTING", seconds_left)

            # After 5 seconds, move chickens back to the starting line
            if elapsed_seconds >= 5:
                for chicken in chickens:
                    chicken.x = START_X_POS
                    chicken.target_x = START_X_POS

            if seconds_left <= 0:
                # Reset logic for the next race
                winner = None
                is_counting_down = False
                off_sound_played = False
                half_way_played = False
                final_stretch_played = False
                for chicken in chickens:
                    chicken.x = START_X_POS
                    chicken.target_x = START_X_POS
                
                # Automatically start the next race's preparation
                if call_to_post_sound:
                    call_to_post_channel = call_to_post_sound.play()
                    is_preparing = True
                    dialog_text = "And they're at the post..."
                    dialog_start_time = pygame.time.get_ticks()
                    send_phase_update("BETTING", POST_RACE_DELAY,
                                      "They're at the post! Place your bets!", "info")
                else:
                    racing = True
                    last_move_time = pygame.time.get_ticks()
                    dialog_text = random.choice(START_COMMENTARY)
                    dialog_start_time = pygame.time.get_ticks()
                    send_phase_update("RACING", None, dialog_text, "info")

        # 3. Drawing (Z-order: Chicken 1 is drawn first, Chicken 5 last/on top)
        screen.blit(background, (0, 0))
        
        # Calculate elapsed time for drawing conditions
        current_ticks = pygame.time.get_ticks()
        elapsed_seconds = (current_ticks - countdown_start_time) // 1000 if is_counting_down else 0

        for chicken in chickens:
            chicken.draw(screen)

            # Draw lane names before race or after 5s of countdown
            if not racing and (not winner or (is_counting_down and elapsed_seconds >= 5)):
                name_surface = name_font.render(CHICKEN_NAMES[chicken.number - 1], True, UI_COLORS["text_accent"])
                # Place the name slightly above the chicken sprite at the starting area
                screen.blit(name_surface, (200, chicken.y + NAME_Y_OFFSET))

        if winner or is_counting_down:
            screen.blit(overlay, (0, 0))

        if is_counting_down:
            seconds_left = max(0, POST_RACE_DELAY - (current_ticks - countdown_start_time) // 1000)
            
            # Change the number color to red when 5 seconds or less remain
            timer_color = UI_COLORS["timer_warning"] if seconds_left <= 5 else UI_COLORS["text_primary"]
            
            timer_label = name_font.render("Time to Next Race", True, UI_COLORS["text_primary"])
            timer_value = font.render(str(seconds_left), True, timer_color)
            
            screen.blit(timer_label, timer_label.get_rect(center=(SCREEN_WIDTH // 2, UI_BOTTOM_ANCHOR - 80)))
            screen.blit(timer_value, timer_value.get_rect(center=(SCREEN_WIDTH // 2, UI_BOTTOM_ANCHOR)))

            # Betting status text
            betting_msg = countdown_display_text(seconds_left)
            
            betting_surface = name_font.render(betting_msg, True, UI_COLORS["text_primary"])
            screen.blit(betting_surface, betting_surface.get_rect(center=(SCREEN_WIDTH // 2, UI_BOTTOM_ANCHOR + 65)))

        if winner:
            winner_text = font.render(f"CHICKEN {winner.number} WINS!", True, UI_COLORS["text_accent"])
            text_rect = winner_text.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2 - 70))
            screen.blit(winner_text, text_rect)
            
            # Display the winner's custom name below the victory text
            winner_name_text = font.render(CHICKEN_NAMES[winner.number - 1], True, UI_COLORS["text_accent"])
            winner_name_rect = winner_name_text.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2 + 70))
            screen.blit(winner_name_text, winner_name_rect)

        # Draw the dialog / commentary text at the top of the screen
        if dialog_text and (current_ticks - dialog_start_time) < DIALOG_DURATION:
            dialog_surface = commentary_font.render(dialog_text, True, UI_COLORS["text_accent"])
            dialog_rect = dialog_surface.get_rect(center=(SCREEN_WIDTH // 2, 150))
            screen.blit(dialog_surface, dialog_rect)

        pygame.display.flip()

    pygame.quit()

if __name__ == "__main__":
    main()