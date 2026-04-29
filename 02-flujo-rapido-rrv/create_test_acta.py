from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

Path("test_files").mkdir(exist_ok=True)

img = Image.new("RGB", (1200, 900), "white")
draw = ImageDraw.Draw(img)

try:
    title_font = ImageFont.truetype("arial.ttf", 48)
    text_font = ImageFont.truetype("arial.ttf", 42)
except:
    title_font = ImageFont.load_default()
    text_font = ImageFont.load_default()

lines = [
    "ACTA ELECTORAL DE PRUEBA",
    "",
    "MESA:10101001021",
    "RECINTO:10101",
    "HABILITADOS:300",
    "",
    "P1:120",
    "P2:90",
    "P3:30",
    "P4:10",
    "BLANCOS:5",
    "NULOS:3",
    "VALIDOS:250",
    "TOTAL:258"
]

y = 60
for i, line in enumerate(lines):
    font = title_font if i == 0 else text_font
    draw.text((80, y), line, fill="black", font=font)
    y += 58

img.save("test_files/acta_ocr_valida.png")
print("Imagen creada: test_files/acta_ocr_valida.png")
