from fastapi import FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from ultralytics import YOLO
from PIL import Image
import io, json

app = FastAPI()
model = YOLO("receipt_v3_50e.pt")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://d2yij8v1sjx53.cloudfront.net"],
    allow_credentials=False,
    allow_methods=["POST"],
    allow_headers=["*"],
)

@app.post("/detect")
async def detect(file: UploadFile):
    img = Image.open(io.BytesIO(await file.read()))
    results = model.predict(task="detect", source=img, max_det=1000, conf=0.25, show_labels=True, classes=0,
                            save=False, show_conf=True, device="cpu", line_width=1)  

    bboxes = results[0].boxes.xyxy.tolist()
    confs = results[0].boxes.conf.tolist()
    return {"boxes": bboxes , "confs":confs}