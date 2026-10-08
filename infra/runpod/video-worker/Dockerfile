# Keep the patched image and video runtimes identical, including Blackwell
# support. Deployment requires a CUDA 13.0-capable host.
FROM pytorch/pytorch:2.13.0-cuda13.0-cudnn9-runtime@sha256:db80a41f8428644cebcb3d75b0b62df334ab6c0e75785951eb25f48bfbd42407

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
RUN pip install --no-cache-dir --no-deps -r requirements.txt && pip check
COPY infra/runpod/omnichat_worker ./omnichat_worker

RUN useradd --create-home --uid 10001 worker && \
    mkdir -p /home/worker/.cache /tmp/omnichat && \
    chown -R worker:worker /app /home/worker /tmp/omnichat
USER worker
ENV HF_HOME=/home/worker/.cache/huggingface \
    TRANSFORMERS_CACHE=/home/worker/.cache/huggingface

ENTRYPOINT ["python", "-m", "omnichat_worker.worker"]
