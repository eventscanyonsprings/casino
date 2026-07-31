"""
Keno Overlay Test - Shows the yellow number PNG overlay at all 40 calculated positions.
Extrapolated from 7 mapped coordinates.

Mapped reference points:
  1: (652, 203)   - Group 0, Sub-row 0, Col 0
  2: (830, 203)   - Group 0, Sub-row 0, Col 1
  3: (1010, 203)  - Group 0, Sub-row 0, Col 2
  4: (1188, 203)  - Group 0, Sub-row 0, Col 3
  5: (1365, 203)  - Group 0, Sub-row 0, Col 4
  6: (651, 285)   - Group 0, Sub-row 1, Col 0
  21: (651, 590)  - Group 2, Sub-row 0, Col 0
"""

import pygame
import sys
import os

# Initialize pygame
pygame.init()

# Get the directory where this script is located
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(SCRIPT_DIR, "assets")

# Constants
SCREEN_WIDTH, SCREEN_HEIGHT = 1920, 1080
FPS = 60

# Colors
GREEN = (0, 255, 0)
WHITE = (255, 255, 255)

# Layout derived from mapped points
# 4 visual groups (rows on background), each with 2 sub-rows of 5 numbers
# Column X positions (cols 0-4)
COLS_X = [651, 830, 1010, 1188, 1365]

# Y start position for each visual group (0, 1, 2, 3)
GROUP_Y_STARTS = [203, 362, 585, 736]

# Y offset within a group between sub-row 0 and sub-row 1
SUB_ROW_DELTA = 82

# Setup display
screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.FULLSCREEN)
pygame.display.set_caption("Keno Overlay Test - All 40 Positions")
clock = pygame.time.Clock()
font = pygame.font.Font(None, 40)

# Load background
background_img = pygame.image.load(os.path.join(ASSETS_DIR, "keno_background.png")).convert()
background_img = pygame.transform.scale(background_img, (SCREEN_WIDTH, SCREEN_HEIGHT))

# Load the yellow number overlay image
yellow_number_img = pygame.image.load(os.path.join(ASSETS_DIR, "keno_yellow_number.png")).convert_alpha()

def get_number_position(num):
    """Calculate (x, y) for a given number 1-40."""
    group = (num - 1) // 10          # 0, 1, 2, 3
    sub_row = ((num - 1) % 10) // 5  # 0 or 1
    col = (num - 1) % 5              # 0, 1, 2, 3, 4
    
    x = COLS_X[col]
    y = GROUP_Y_STARTS[group] + (sub_row * SUB_ROW_DELTA)
    
    # Manual per-number adjustments
    if 26 <= num <= 30:
        y -= 5  # User requested: 26-30 up 5px
    
    return x, y

def build_keno_coords():
    """Generate the full 40-number coordinate dictionary."""
    coords = {}
    for num in range(1, 41):
        coords[num] = get_number_position(num)
    return coords

# Build all coordinates
keno_coords = build_keno_coords()

print("=== ALL 40 KENO COORDINATES ===")
print("keno_coords = {")
for num in sorted(keno_coords):
    print(f"    {num}: ({keno_coords[num][0]}, {keno_coords[num][1]}),")
print("}")

# Check against our mapped reference points
mapped = {1: (652, 203), 2: (830, 203), 3: (1010, 203), 4: (1188, 203), 
          5: (1365, 203), 6: (651, 285), 21: (651, 590)}
print("\n=== VERIFICATION ===")
for num, (mx, my) in mapped.items():
    cx, cy = keno_coords[num]
    dx = abs(mx - cx)
    dy = abs(my - cy)
    status = "OK" if dx <= 1 and dy <= 1 else "MISMATCH!"
    print(f"  #{num:2d}: mapped=({mx},{my}) calc=({cx},{cy}) delta=({dx},{dy}) {status}")

# Main loop
running = True
while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_ESCAPE:
                running = False
    
    # Draw background
    screen.blit(background_img, (0, 0))
    
    # Draw yellow number overlay at all 40 positions
    for num, (x, y) in keno_coords.items():
        # Use the actual yellow number PNG at 50% opacity (like the mapper tool)
        overlay_surface = yellow_number_img.copy()
        overlay_surface.set_alpha(128)
        screen.blit(overlay_surface, (x, y))
        
        # Number label on top
        label = font.render(str(num), True, WHITE)
        label_rect = label.get_rect(center=(x + yellow_number_img.get_width() // 2, y + yellow_number_img.get_height() // 2))
        screen.blit(label, label_rect)
    
    # Title
    title_font = pygame.font.Font(None, 48)
    title = title_font.render("Keno Number Positions - All 40 Numbers", True, GREEN)
    screen.blit(title, (50, 50))
    
    subtitle = font.render("Press ESC to exit", True, WHITE)
    screen.blit(subtitle, (50, 100))
    
    pygame.display.flip()
    clock.tick(FPS)

pygame.quit()
sys.exit()