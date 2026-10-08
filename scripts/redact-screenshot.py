#!/usr/bin/env python3
"""Prepare the reviewed 1251x908 homepage capture for publication.

Only opaque replacements are used: private text cannot be recovered by deblurring.
Do not apply these coordinates to another layout without visually reviewing it.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
root = Path(__file__).resolve().parents[1]
image = Image.open(root / '.logs/web-ui-loaded.png').convert('RGB')
if image.size != (1251, 908):
    raise SystemExit('Unexpected screenshot size: review redaction coordinates first.')
draw = ImageDraw.Draw(image)
font_path = '/usr/share/fonts/TTF/DejaVuSans.ttf'
small = ImageFont.truetype(font_path, 14)
large = ImageFont.truetype(font_path, 25)
# Entire project and recent-chat areas, including partially visible names.
draw.rectangle((56, 170, 282, 907), fill='#181818')
for y, label in [(190,'demo-project'),(278,'web-app'),(366,'research'),(454,'documentation')]:
    draw.rounded_rectangle((65,y-15,270,y+14),radius=8,fill='#292929')
    draw.text((78,y-10),label,font=small,fill='#dddddd')
    draw.text((88,y+28),'Example conversation',font=small,fill='#999999')
# Active project in the page heading and composer.
draw.rectangle((400, 426, 1090, 479),fill='#191919')
draw.text((425,435),'What should we work on in demo-project?',font=large,fill='#dddddd')
draw.rectangle((416,752,750,790),fill='#272727')
draw.text((432,762),'demo-project',font=small,fill='#dddddd')
image.save(root / 'docs/images/screenshot.png')
