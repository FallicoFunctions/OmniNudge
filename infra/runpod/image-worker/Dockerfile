# CUDA 12.8/PyTorch 2.7 includes Blackwell kernels, which RunPod may assign
# for the 24 GB serverless tier used by this endpoint.
FROM pytorch/pytorch:2.7.1-cuda12.8-cudnn9-runtime

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
COPY infra/runpod/image-worker/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY infra/runpod/omnichat_worker ./omnichat_worker

RUN useradd --create-home --uid 10001 worker && \
    mkdir -p /home/worker/.cache /tmp/omnichat && \
    chown -R worker:worker /app /home/worker /tmp/omnichat
USER worker
ENV HF_HOME=/home/worker/.cache/huggingface \
    TRANSFORMERS_CACHE=/home/worker/.cache/huggingface

ENTRYPOINT ["python", "-m", "omnichat_worker.worker"]
