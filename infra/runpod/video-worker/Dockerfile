# Keep image and video workers on the same CUDA runtime so either media path
# can run on the Blackwell GPUs available in RunPod's 24 GB serverless tier.
FROM pytorch/pytorch:2.7.1-cuda12.8-cudnn9-runtime

ARG OMNICHAT_WORKER_BUILD=unknown

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    OMNICHAT_WORKER_KIND=video \
    OMNICHAT_WORKER_BUILD=${OMNICHAT_WORKER_BUILD}

# Video sampling allocates a wide range of block sizes across 121 frames. A
# render that ran out of memory on a 44 GiB card was holding 3.76 GiB reserved
# but unallocated -- pure fragmentation. This has to be set before torch
# initialises CUDA, so it belongs in the image rather than the template.
ENV PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True

WORKDIR /app
COPY infra/runpod/video-worker/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY infra/runpod/omnichat_worker ./omnichat_worker

RUN useradd --create-home --uid 10001 worker && \
    mkdir -p /home/worker/.cache /tmp/omnichat && \
    chown -R worker:worker /app /home/worker /tmp/omnichat
USER worker
ENV HF_HOME=/home/worker/.cache/huggingface \
    TRANSFORMERS_CACHE=/home/worker/.cache/huggingface

ENTRYPOINT ["python", "-m", "omnichat_worker.worker"]
