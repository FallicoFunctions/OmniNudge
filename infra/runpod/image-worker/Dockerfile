# This patched runtime retains Blackwell support. Select CUDA 13.0-capable
# hosts when deploying; the digest also fixes the Python 3.12 base environment.
FROM pytorch/pytorch:2.13.0-cuda13.0-cudnn9-runtime@sha256:db80a41f8428644cebcb3d75b0b62df334ab6c0e75785951eb25f48bfbd42407

# The image tag a RunPod template points at is not visible from inside the
# container, so a generated asset cannot otherwise be traced back to the code
# that produced it. Stamp the tag at build time and return it with every job.
ARG OMNICHAT_WORKER_BUILD=unknown

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    OMNICHAT_WORKER_KIND=image \
    OMNICHAT_WORKER_BUILD=${OMNICHAT_WORKER_BUILD}

WORKDIR /app
RUN python3 -m venv --without-pip --system-site-packages /opt/worker-venv
ENV PATH="/opt/worker-venv/bin:${PATH}"
COPY infra/runpod/image-worker/requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir --no-deps -r requirements.txt && python -m pip check
COPY infra/runpod/omnichat_worker ./omnichat_worker

RUN useradd --create-home --uid 10001 worker && \
    mkdir -p /home/worker/.cache /tmp/omnichat && \
    chown -R worker:worker /app /home/worker /tmp/omnichat
USER worker
ENV HF_HOME=/home/worker/.cache/huggingface \
    TRANSFORMERS_CACHE=/home/worker/.cache/huggingface

ENTRYPOINT ["python", "-m", "omnichat_worker.worker"]
