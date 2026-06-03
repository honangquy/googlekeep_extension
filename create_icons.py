import os
from PIL import Image, ImageDraw, ImageFont

def create_keep_icon(size):
    # Tạo ảnh nền trong suốt
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Căn lề và bo góc cho hình vuông vàng
    padding = size // 12
    border_radius = size // 5
    
    # Vẽ hình vuông bo góc màu vàng đặc trưng của Keep
    draw.rounded_rectangle(
        [padding, padding, size - padding, size - padding], 
        radius=border_radius, 
        fill='#FBBF24'
    )
    
    # Vẽ 3 dòng kẻ màu trắng tượng trưng cho note
    line_w = size * 0.45
    line_h = max(1, size // 15)
    start_x = (size - line_w) / 2
    gap = size // 5.5
    start_y = (size - (gap * 2)) / 2 - (line_h / 2)

    for i in range(3):
        y = start_y + i * gap
        # Dòng cuối ngắn hơn một chút cho tự nhiên
        current_w = line_w if i < 2 else line_w * 0.6
        draw.rounded_rectangle(
            [start_x, y, start_x + current_w, y + line_h], 
            radius=line_h//2, 
            fill='white'
        )
    
    if not os.path.exists("icons"):
        os.makedirs("icons")
        
    filename = f"icons/icon{size}.png"
    img.save(filename)
    print(f"Created {filename}")

if __name__ == "__main__":
    for size in [16, 48, 128]:
        create_keep_icon(size)
