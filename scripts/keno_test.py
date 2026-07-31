import pygame
import sys

# Initialize pygame
pygame.init()

# Constants
SCREEN_WIDTH, SCREEN_HEIGHT = 1920, 1080
FPS = 60
MOVE_SPEED = 1

# Colors
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
YELLOW = (255, 255, 0)
GREEN = (0, 255, 0)
RED = (255, 0, 0)
BLUE = (0, 128, 255)
GRAY = (128, 128, 128)
DARK_GRAY = (40, 40, 40)

# Setup display
screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.FULLSCREEN)
pygame.display.set_caption("Keno Number Mapper")
clock = pygame.time.Clock()
font = pygame.font.Font(None, 36)
small_font = pygame.font.Font(None, 24)
title_font = pygame.font.Font(None, 48)

# Load images
background_img = pygame.image.load("./assets/keno_background.png").convert()
background_img = pygame.transform.scale(background_img, (SCREEN_WIDTH, SCREEN_HEIGHT))

yellow_number_img = pygame.image.load("./assets/keno_yellow_number.png").convert_alpha()

# Overlay position (start centered)
overlay_rect = yellow_number_img.get_rect()
overlay_rect.center = (SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2)

# State
saved_spots = []  # list of (number, x, y)
current_number = 1
font_mode = True  # True = number, False = coordinates
show_help = True
help_timer = 0

def draw_grid():
    """Draw a 40-cell grid overlay to help visualize the keno board cells"""
    cols, rows = 10, 4
    cell_w = (SCREEN_WIDTH - 40) // cols
    cell_h = (SCREEN_HEIGHT - 40) // rows
    offset_x = 20
    offset_y = 20
    for row in range(rows):
        for col in range(cols):
            x = offset_x + col * cell_w
            y = offset_y + row * cell_h
            pygame.draw.rect(screen, (255, 255, 255, 60), (x, y, cell_w, cell_h), 1)
            num = row * cols + col + 1
            label = small_font.render(str(num), True, (200, 200, 200))
            screen.blit(label, (x + 4, y + 4))

def draw_info_panel():
    """Draw the info panel on the right side"""
    panel_x = SCREEN_WIDTH - 180
    panel_y = 20
    panel_w = 160
    panel_h = SCREEN_HEIGHT - 40
    
    # Panel background
    s = pygame.Surface((panel_w, panel_h), pygame.SRCALPHA)
    s.fill((0, 0, 0, 180))
    screen.blit(s, (panel_x, panel_y))
    
    # Title
    title = title_font.render("Keno Mapper", True, YELLOW)
    screen.blit(title, (panel_x + 10, panel_y + 10))
    
    # Current number
    num_text = font.render(f"Number: {current_number}", True, WHITE)
    screen.blit(num_text, (panel_x + 10, panel_y + 60))
    
    # Coordinates
    coord_text = font.render(f"X: {overlay_rect.x}", True, WHITE)
    screen.blit(coord_text, (panel_x + 10, panel_y + 95))
    coord_text2 = font.render(f"Y: {overlay_rect.y}", True, WHITE)
    screen.blit(coord_text2, (panel_x + 10, panel_y + 125))
    
    # Mode indicator
    mode_text = small_font.render("Mode: SPACE saves number", True, GREEN if font_mode else BLUE)
    screen.blit(mode_text, (panel_x + 10, panel_y + 160))
    
    # Saved count
    count_text = small_font.render(f"Saved: {len(saved_spots)} spots", True, WHITE)
    screen.blit(count_text, (panel_x + 10, panel_y + 190))
    
    # Saved numbers list
    if saved_spots:
        list_title = small_font.render("Saved Spots:", True, YELLOW)
        screen.blit(list_title, (panel_x + 10, panel_y + 225))
        max_display = min(len(saved_spots), 15)
        for i in range(max_display):
            num, x, y = saved_spots[i]
            spot_text = small_font.render(f"#{num}: ({x},{y})", True, WHITE)
            screen.blit(spot_text, (panel_x + 10, panel_y + 250 + i * 22))
        if len(saved_spots) > 15:
            more_text = small_font.render(f"... and {len(saved_spots) - 15} more", True, GRAY)
            screen.blit(more_text, (panel_x + 10, panel_y + 250 + 15 * 22))
    
    # Help text
    if show_help:
        help_y = panel_y + panel_h - 180
        helps = [
            "ARROWS: Move overlay",
            "SPACE: Save number",
            "PGUP/PGDN: Change num",
            "M: Toggle mode",
            "ESC: Print & exit",
            "H: Toggle help"
        ]
        for i, line in enumerate(helps):
            h_text = small_font.render(line, True, (180, 180, 180))
            screen.blit(h_text, (panel_x + 10, help_y + i * 22))

def draw_saved_markers():
    """Draw markers on the background for saved spots"""
    for num, x, y in saved_spots:
        # Draw a small circle marker
        pygame.draw.circle(screen, YELLOW, (x + overlay_rect.width // 2, y + overlay_rect.height // 2), 6, 2)
        label = small_font.render(str(num), True, YELLOW)
        screen.blit(label, (x + overlay_rect.width // 2 + 8, y + overlay_rect.height // 2 - 8))

def get_next_available_number():
    """Get the next number 1-40 that hasn't been saved yet"""
    saved_nums = {n for n, _, _ in saved_spots}
    for n in range(1, 41):
        if n not in saved_nums:
            return n
    return None  # All numbers used

# Main loop
running = True
# Movement cooldown: milliseconds between moves when holding a key
MOVE_INTERVAL = 100  # 100ms = 10 moves/sec
move_cooldown = 0
while running:
    dt = clock.tick(FPS)
    move_cooldown -= dt
    
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_ESCAPE:
                # Print saved data
                print("\n" + "=" * 60)
                print("KENO NUMBER MAP DATA")
                print("=" * 60)
                print(f"\nTotal spots saved: {len(saved_spots)}\n")
                print("Number |  X  |  Y")
                print("-" * 25)
                for num, x, y in saved_spots:
                    print(f"  {num:2d}   | {x:3d} | {y:3d}")
                print("=" * 60)
                print("\nPaste this into Python code:")
                print("keno_coords = {")
                for num, x, y in sorted(saved_spots, key=lambda s: s[0]):
                    print(f"    {num}: ({x}, {y}),")
                print("}")
                print("=" * 60)
                running = False
            
            elif event.key == pygame.K_h:
                show_help = not show_help
            
            elif event.key == pygame.K_SPACE:
                if current_number is not None and 1 <= current_number <= 40:
                    # Check if this number already saved
                    existing = [s for s in saved_spots if s[0] == current_number]
                    if not existing:
                        saved_spots.append((current_number, overlay_rect.x, overlay_rect.y))
                        print(f"Saved Number {current_number} at ({overlay_rect.x}, {overlay_rect.y})")
                        # Auto-advance to next available number
                        next_num = get_next_available_number()
                        if next_num is not None:
                            current_number = next_num
                        else:
                            print("All 40 numbers have been saved!")
                    else:
                        print(f"Number {current_number} already saved! Change the number first.")
            
            elif event.key == pygame.K_PAGEUP:
                if current_number is not None:
                    current_number = current_number - 1 if current_number > 1 else 40
            
            elif event.key == pygame.K_PAGEDOWN:
                if current_number is not None:
                    current_number = current_number + 1 if current_number < 40 else 1
    
    # Continuous movement for held arrow keys (with cooldown)
    if move_cooldown <= 0:
        pressed = pygame.key.get_pressed()
        mods = pygame.key.get_mods()
        step = 20 if mods & pygame.KMOD_SHIFT else 1
        
        moved = False
        if pressed[pygame.K_LEFT]:
            overlay_rect.x -= step
            moved = True
        if pressed[pygame.K_RIGHT]:
            overlay_rect.x += step
            moved = True
        if pressed[pygame.K_UP]:
            overlay_rect.y -= step
            moved = True
        if pressed[pygame.K_DOWN]:
            overlay_rect.y += step
            moved = True
        
        if moved:
            move_cooldown = MOVE_INTERVAL
    
    # Clamp overlay to screen
    overlay_rect.clamp_ip(screen.get_rect())
    
    # Draw everything
    screen.blit(background_img, (0, 0))
    
    # Draw grid overlay (semi-transparent)
    s = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
    # Draw faint grid
    cols, rows = 10, 4
    cell_w = (SCREEN_WIDTH - 40) // cols
    cell_h = (SCREEN_HEIGHT - 40) // rows
    offset_x = 20
    offset_y = 20
    for row in range(rows):
        for col in range(cols):
            x = offset_x + col * cell_w
            y = offset_y + row * cell_h
            pygame.draw.rect(s, (255, 255, 255, 30), (x, y, cell_w, cell_h), 1)
    screen.blit(s, (0, 0))
    
    # Draw saved markers
    draw_saved_markers()
    
    # Draw overlay image (the yellow number highlight) at 50% opacity
    overlay_surface = yellow_number_img.copy()
    overlay_surface.set_alpha(128)
    screen.blit(overlay_surface, overlay_rect)
    
    # Draw info panel
    draw_info_panel()
    
    pygame.display.flip()

pygame.quit()
sys.exit()