#!/usr/bin/env python3
"""Generate a 1200x630 social share (OG/Twitter) image for Arcade Hub."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1200, 630
FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_R = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

# Vertical gradient background matching the site --bg-gradient
bg = Image.new("RGB", (W, H))
top = (15, 12, 41)      # #0f0c29
mid = (48, 43, 99)      # #302b63
bot = (36, 36, 62)      # #24243e
for y in range(H):
    if y < H // 2:
        t = y / (H // 2)
        c = tuple(int(top[i] + (mid[i] - top[i]) * t) for i in range(3))
    else:
        t = (y - H // 2) / (H - H // 2)
        c = tuple(int(mid[i] + (bot[i] - mid[i]) * t) for i in range(3))
    bg.putpixel((0, y), c)
# stretch the single-pixel column across
bg = bg.resize((W, H))
draw = ImageDraw.Draw(bg, "RGBA")

# Neon glow blobs (cyan + magenta) for atmosphere
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse([-150, -150, 400, 400], fill=(0, 243, 255, 70))
gd.ellipse([W - 350, H - 350, W + 150, H + 150], fill=(255, 0, 255, 60))
glow = glow.filter(ImageFilter.GaussianBlur(120))
bg = Image.alpha_composite(bg.convert("RGBA"), glow).convert("RGB")
draw = ImageDraw.Draw(bg, "RGBA")

# Logo on the left
logo = Image.open("favicon-512.png").convert("RGBA").resize((330, 330), Image.LANCZOS)
bg.paste(logo, (90, (H - 330) // 2), logo)

# Title text (with subtle cyan glow behind)
title_font = ImageFont.truetype(FONT_B, 104)
sub_font = ImageFont.truetype(FONT_B, 40)
tag_font = ImageFont.truetype(FONT_R, 30)

tx = 470
# glow
glow_txt = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gtd = ImageDraw.Draw(glow_txt)
gtd.text((tx, 150), "ARCADE HUB", font=title_font, fill=(0, 243, 255, 120))
glow_txt = glow_txt.filter(ImageFilter.GaussianBlur(8))
bg = Image.alpha_composite(bg.convert("RGBA"), glow_txt).convert("RGB")
draw = ImageDraw.Draw(bg, "RGBA")

draw.text((tx, 150), "ARCADE HUB", font=title_font, fill=(255, 255, 255, 255))
draw.text((tx, 275), "by bittuhere", font=sub_font, fill=(0, 243, 255, 255))
draw.text((tx, 340), "Free online browser games — play instantly,", font=tag_font, fill=(200, 200, 210, 255))
draw.text((tx, 380), "no downloads, no ads.", font=tag_font, fill=(200, 200, 210, 255))

# neon divider line
draw.rectangle([tx, 445, tx + 620, 449], fill=(0, 243, 255, 200))
# game chips
chips = ["Flappy", "Dino", "Snake", "Pac-Man", "Tic-Tac-Toe", "Multiplayer"]
cx, cy = tx, 475
chip_font = ImageFont.truetype(FONT_B, 26)
for ch in chips:
    tw = draw.textlength(ch, font=chip_font)
    pad = 16
    draw.rounded_rectangle([cx, cy, cx + tw + pad * 2, cy + 44], radius=22,
                           outline=(0, 243, 255, 160), width=2, fill=(255, 255, 255, 18))
    draw.text((cx + pad, cy + 6), ch, font=chip_font, fill=(235, 235, 245, 255))
    cx += tw + pad * 2 + 12
    if cx > W - 160:
        break

bg.save("preview.png", "PNG", optimize=True)
print("wrote preview.png", bg.size)
