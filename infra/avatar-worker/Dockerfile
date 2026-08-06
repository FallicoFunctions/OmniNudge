FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY . ./avatar_worker

RUN useradd --create-home --uid 10001 worker && \
    mkdir -p /home/worker/.cache /models /models/huggingface /models/cache && \
    chown -R worker:worker /app /home/worker /models
USER worker
ENV HF_HOME=/models/huggingface \
    XDG_CACHE_HOME=/models/cache \
    AVATAR_IMAGE_PATH=/models/avatar.png

ENTRYPOINT ["python", "-m", "avatar_worker.worker"]
