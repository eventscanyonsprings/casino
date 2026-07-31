"""
Keno Position Tool - Displays the keno background and shows cursor x,y position.
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
WHITE = (255, 255, 255)
YELLOW = (255, 255, 0)
BLACK = (0, 0, 0)
GREEN = (0, 255, 0)

# Setup display
screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.FULLSCREEN)
pygame.display.set_caption("Keno Position Tool")
clock = pygame.time.Clock()
font = pygame.font.Font(None, 48)
coord_font = pygame.font.Font(None, 36)

# Load background
background_img = pygame.image.load(os.path.join(ASSETS_DIR, "keno_background.png")).convert()
background_img = pygame.transform.scale(background_img, (SCREEN_WIDTH, SCREEN_HEIGHT))

# Main loop
running = True
while running:
    clock.tick(FPS)

    mouse_x, mouse_y = pygame.mouse.get_pos()

    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_ESCAPE:
                running = False
            elif event.key == pygame.K_SPACE:
                # Print coordinates to console on space bar
                print(f"({mouse_x}, {mouse_y})")

    # Draw background
    screen.blit(background_img, (0, 0))

    # Draw cursor crosshair
    pygame.draw.line(screen, GREEN, (mouse_x - 20, mouse_y), (mouse_x + 20, mouse_y), 2)
    pygame.draw.line(screen, GREEN, (mouse_x, mouse_y - 20), (mouse_x, mouse_y + 20), 2)

    # Draw coordinate display background
    coord_bg = pygame.Surface((400, 100))
    coord_bg.set_alpha(180)
    coord_bg.fill(BLACK)
    screen.blit(coord_bg, (10, 10))

    # Draw coordinate text
    title = font.render("Cursor Position", True, YELLOW)
    screen.blit(title, (20, 15))

    coord_text = coord_font.render(f"X: {mouse_x:>4}   Y: {mouse_y:>4}", True, WHITE)
    screen.blit(coord_text, (20, 60))

    # Draw instructions
    instr_font = pygame.font.Font(None, 28)
    instr_text = instr_font.render("Press ESC to exit  |  SPACE to log coordinates to console", True, WHITE)
    screen.blit(instr_text, (20, SCREEN_HEIGHT - 40))

    pygame.display.flip()

pygame.quit()
sys.exit()