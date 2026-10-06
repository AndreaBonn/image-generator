"""Draw the fixed O6 gate inputs: 5 line sketches and 3 stick-figure poses (1024x1024)."""

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).parent / "inputs"
SIZE = 1024
STROKE = 8


def canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new(mode="RGB", size=(SIZE, SIZE), color="white")
    return image, ImageDraw.Draw(image)


def house() -> Image.Image:
    image, d = canvas()
    d.rectangle(xy=(300, 480, 724, 820), outline="black", width=STROKE)
    d.polygon(xy=[(260, 490), (512, 260), (764, 490)], outline="black", width=STROKE)
    d.rectangle(xy=(470, 640, 560, 820), outline="black", width=STROKE)
    d.rectangle(xy=(350, 540, 430, 610), outline="black", width=STROKE)
    d.rectangle(xy=(600, 540, 680, 610), outline="black", width=STROKE)
    d.line(xy=[(80, 820), (944, 820)], fill="black", width=STROKE)
    d.ellipse(xy=(780, 120, 900, 240), outline="black", width=STROKE)
    return image


def cat() -> Image.Image:
    image, d = canvas()
    d.ellipse(xy=(360, 260, 660, 520), outline="black", width=STROKE)
    d.polygon(xy=[(390, 320), (400, 190), (480, 275)], outline="black", width=STROKE)
    d.polygon(xy=[(630, 320), (620, 190), (540, 275)], outline="black", width=STROKE)
    d.ellipse(xy=(300, 500, 720, 880), outline="black", width=STROKE)
    d.arc(xy=(640, 600, 900, 900), start=180, end=320, fill="black", width=STROKE)
    d.ellipse(xy=(440, 360, 470, 390), fill="black")
    d.ellipse(xy=(550, 360, 580, 390), fill="black")
    return image


def mountains() -> Image.Image:
    image, d = canvas()
    d.line(
        xy=[(40, 600), (300, 250), (480, 520), (650, 180), (984, 600)], fill="black", width=STROKE
    )
    d.line(xy=[(40, 600), (984, 600)], fill="black", width=STROKE)
    for y in (680, 760, 840):
        d.line(xy=[(120, y), (420, y)], fill="black", width=4)
        d.line(xy=[(560, y + 20), (900, y + 20)], fill="black", width=4)
    d.polygon(xy=[(440, 700), (600, 700), (570, 750), (470, 750)], outline="black", width=STROKE)
    return image


def cup() -> Image.Image:
    image, d = canvas()
    d.line(xy=[(60, 760), (964, 760)], fill="black", width=STROKE)
    d.rectangle(xy=(380, 480, 620, 760), outline="black", width=STROKE)
    d.arc(xy=(580, 530, 720, 690), start=270, end=90, fill="black", width=STROKE)
    for x in (440, 500, 560):
        d.arc(xy=(x - 20, 330, x + 20, 460), start=90, end=270, fill="black", width=4)
    d.ellipse(xy=(150, 640, 300, 760), outline="black", width=STROKE)
    return image


def car() -> Image.Image:
    image, d = canvas()
    d.line(
        xy=[
            (150, 620),
            (150, 500),
            (330, 500),
            (420, 380),
            (650, 380),
            (760, 500),
            (880, 520),
            (880, 620),
            (150, 620),
        ],
        fill="black",
        width=STROKE,
    )
    d.ellipse(xy=(230, 560, 370, 700), outline="black", width=STROKE)
    d.ellipse(xy=(660, 560, 800, 700), outline="black", width=STROKE)
    d.line(xy=[(440, 400), (440, 500)], fill="black", width=STROKE)
    d.line(xy=[(60, 700), (964, 700)], fill="black", width=4)
    return image


def stick(joints: dict[str, tuple[int, int]]) -> Image.Image:
    image, d = canvas()
    head = joints["head"]
    d.ellipse(
        xy=(head[0] - 60, head[1] - 60, head[0] + 60, head[1] + 60), outline="black", width=STROKE
    )
    bones = [
        ("neck", "hip"),
        ("neck", "l_hand"),
        ("neck", "r_hand"),
        ("hip", "l_foot"),
        ("hip", "r_foot"),
    ]
    for start, end in bones:
        d.line(xy=[joints[start], joints[end]], fill="black", width=14)
    return image


POSES = {
    "posa_braccia_alzate": {
        "head": (512, 200),
        "neck": (512, 270),
        "hip": (512, 600),
        "l_hand": (330, 90),
        "r_hand": (694, 90),
        "l_foot": (400, 920),
        "r_foot": (624, 920),
    },
    "posa_seduto": {
        "head": (480, 260),
        "neck": (480, 330),
        "hip": (500, 620),
        "l_hand": (650, 520),
        "r_hand": (380, 560),
        "l_foot": (760, 900),
        "r_foot": (700, 640),
    },
    "posa_corsa": {
        "head": (560, 200),
        "neck": (540, 270),
        "hip": (500, 580),
        "l_hand": (720, 380),
        "r_hand": (320, 300),
        "l_foot": (300, 880),
        "r_foot": (760, 760),
    },
}

SKETCHES = {
    "schizzo_casa": house,
    "schizzo_gatto": cat,
    "schizzo_montagne": mountains,
    "schizzo_tazza": cup,
    "schizzo_auto": car,
}

if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for name, draw in SKETCHES.items():
        draw().save(OUT / f"{name}.png")
    for name, joints in POSES.items():
        stick(joints=joints).save(OUT / f"{name}.png")
    print(sorted(path.name for path in OUT.iterdir()))
