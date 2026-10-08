FROM pytorch/pytorch:2.13.0-cuda13.0-cudnn9-runtime@sha256:db80a41f8428644cebcb3d75b0b62df334ab6c0e75785951eb25f48bfbd42407

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
# The upstream image includes Spin for building PyTorch. It is not a runtime
# dependency and its Click ceiling conflicts with the application's lock.
RUN python3 -m pip uninstall --break-system-packages --yes spin && \
    python3 -m venv --without-pip --system-site-packages /opt/worker-venv
ENV PATH="/opt/worker-venv/bin:${PATH}"
COPY requirements.txt ./requirements.txt
RUN sed -E '/^(torch|torchvision)==/d' requirements.txt > worker-requirements.txt && \
    python -m pip install --no-cache-dir --no-deps -r worker-requirements.txt && python -m pip check
COPY . ./avatar_worker

RUN useradd --create-home --uid 10001 worker && \
    mkdir -p /home/worker/.cache /models /models/huggingface /models/cache && \
    chown -R worker:worker /app /home/worker /models
USER worker
ENV HF_HOME=/models/huggingface \
    XDG_CACHE_HOME=/models/cache \
    AVATAR_IMAGE_PATH=/models/avatar.png

ENTRYPOINT ["python", "-m", "avatar_worker.worker"]
