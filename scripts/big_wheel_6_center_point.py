from PIL import Image, ImageDraw
import os

def check_and_mark_wheel_center():
    asset_path = os.path.join("assets", "bw6_wheel.png")
    
    if not os.path.exists(asset_path):
        print(f"Error: Could not find {asset_path}")
        return

    # Open the wheel image
    img = Image.open(asset_path).convert("RGBA")
    width, height = img.size
    
    # Calculate exact center
    center_x = width // 2
    center_y = height // 2
    
    print(f"Image Dimensions: {width}x{height}")
    print(f"Calculated Center Point: ({center_x}, {center_y})")
    
    # Create a drawing context
    draw = ImageDraw.Draw(img)
    
    # Draw a larger 20x20 pixel square right at the center coordinates
    square_size = 10
    draw.rectangle(
        [
            center_x - square_size, 
            center_y - square_size, 
            center_x + square_size - 1, 
            center_y + square_size - 1
        ], 
        fill=(255, 255, 255, 255) # Bright red with full opacity
    )
    
    # Save as a diagnostic file to test
    output_path = os.path.join("assets", "bw6_wheel_debug.png")
    img.save(output_path)
    print(f"Saved diagnostic wheel with large center marker to: {output_path}")
    print("Tip: Temporarily point your pygame script to load 'bw6_wheel_debug.png' to instantly see how far off the file center is from the actual drawn wheel hub!")

if __name__ == "__main__":
    check_and_mark_wheel_center()