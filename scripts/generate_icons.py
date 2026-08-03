#!/usr/bin/env python3
"""Generate PNG app icons from the SVG source for PWA / iOS home screen."""
import os
import sys
import shutil

SVG_PATH = os.path.join(os.path.dirname(__file__), '..', 'client', 'assets', 'icon.svg')
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'client', 'assets')

SIZES = [16, 32, 180, 192, 512]


def main():
    # Make paths absolute
    svg_path = os.path.abspath(SVG_PATH)
    out_dir = os.path.abspath(OUT_DIR)

    if not os.path.exists(svg_path):
        print(f'ERROR: SVG not found at {svg_path}', file=sys.stderr)
        sys.exit(1)

    print(f'SVG source: {svg_path}')
    print(f'Output dir: {out_dir}')

    try:
        import cairosvg
    except (ImportError, OSError) as e:
        print(f'ERROR: cairosvg not available: {e}', file=sys.stderr)
        print('Falling back to Pillow-only approach (no SVG rendering)...', file=sys.stderr)
        # Fallback: create simple solid-color PNG icons with Pillow
        try:
            from PIL import Image, ImageDraw, ImageFont
        except ImportError:
            print('ERROR: Pillow also not available. Cannot generate icons.', file=sys.stderr)
            sys.exit(1)
        for size in SIZES:
            img = Image.new('RGBA', (size, size), (10, 17, 30, 255))
            draw = ImageDraw.Draw(img)
            # Draw a gold circle
            margin = size // 8
            draw.ellipse([margin, margin, size - margin, size - margin],
                         outline=(212, 175, 55, 255), width=max(2, size // 32))
            # Draw inner circle
            inner_margin = size // 5
            draw.ellipse([inner_margin, inner_margin, size - inner_margin, size - inner_margin],
                         outline=(212, 175, 55, 100), width=max(1, size // 64))
            # Draw "C" letter
            font_size = int(size * 0.45)
            try:
                font = ImageFont.truetype("arial.ttf", font_size)
            except (OSError, IOError):
                font = ImageFont.load_default()
            text = "C"
            bbox = draw.textbbox((0, 0), text, font=font)
            tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
            tx = (size - tw) // 2 - bbox[0]
            ty = (size - th) // 2 - bbox[1] - size // 20
            draw.text((tx, ty), text, fill=(212, 175, 55, 255), font=font)
            # Draw decorative dots
            dot_r = max(2, size // 42)
            for cx, cy in [(size // 2, size // 6), (size // 2, size - size // 6),
                           (size // 6, size // 2), (size - size // 6, size // 2)]:
                draw.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r],
                             fill=(212, 175, 55, 255))
            png_path = os.path.join(out_dir, f'icon-{size}.png')
            img.save(png_path, 'PNG')
            print(f'Generated {png_path} (fallback)')
        # apple-touch-icon
        shutil.copy(os.path.join(out_dir, 'icon-180.png'),
                    os.path.join(out_dir, 'apple-touch-icon.png'))
        print('Generated apple-touch-icon.png (fallback)')
        print('Done (fallback mode)!')
        return

    for size in SIZES:
        png_path = os.path.join(out_dir, f'icon-{size}.png')
        try:
            cairosvg.svg2png(url=svg_path, write_to=png_path,
                             output_width=size, output_height=size)
            if os.path.exists(png_path):
                print(f'Generated {png_path} ({os.path.getsize(png_path)} bytes)')
            else:
                print(f'ERROR: {png_path} was not created', file=sys.stderr)
        except Exception as e:
            print(f'ERROR generating {png_path}: {e}', file=sys.stderr)

    # apple-touch-icon (180x180 is the recommended iOS size)
    src_180 = os.path.join(out_dir, 'icon-180.png')
    dst = os.path.join(out_dir, 'apple-touch-icon.png')
    if os.path.exists(src_180):
        shutil.copy(src_180, dst)
        print(f'Generated {dst}')
    else:
        print(f'ERROR: {src_180} not found, cannot create apple-touch-icon.png', file=sys.stderr)

    print('Done!')


if __name__ == '__main__':
    main()