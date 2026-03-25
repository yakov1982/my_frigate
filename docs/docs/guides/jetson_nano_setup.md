---
id: jetson_nano_setup
title: NVIDIA Jetson Nano B01 Setup Guide
---

import CommunityBadge from '@site/src/components/CommunityBadge';

<CommunityBadge />

# NVIDIA Jetson Nano B01 — What You Can Build with Frigate

The NVIDIA Jetson Nano B01 is a compact, power-efficient single-board computer with a 128-core Maxwell GPU that makes it well suited for running Frigate NVR with hardware-accelerated video decoding and AI-based object detection. This guide covers what the Jetson Nano B01 can do within the Frigate ecosystem and how to set it up.

## Capabilities Overview

When paired with Frigate, the Jetson Nano B01 enables:

- **Real-time AI object detection** on IP camera feeds using TensorRT or ONNX models running on the onboard GPU
- **Hardware-accelerated video decoding** via the dedicated NVDEC media engine (`h264_nvmpi`, `hevc_nvmpi`), freeing the CPU from expensive video decompression work
- **Hardware-accelerated video encoding** via the dedicated NVENC media engine (`h264_nvmpi` encoder)
- **24/7 recording** with intelligent retention based on detected objects (people, cars, animals, etc.)
- **Low-latency live view** via RTSP restreaming, WebRTC, and MSE
- **Home Assistant integration** for smart-home automations triggered by detected objects
- **MQTT event publishing** for integration with other systems
- **Multiple camera support** — the Jetson Nano B01 can handle 2-4 cameras at 720p-1080p depending on model complexity and frame rates

### What Makes the Jetson Nano B01 a Good Fit

| Feature | Jetson Nano B01 Spec | Frigate Benefit |
| --- | --- | --- |
| 128-core Maxwell GPU | CUDA 5.3 Compute Capability | TensorRT / ONNX inference at ~20-40 ms |
| Dedicated NVDEC | H.264 / H.265 hardware decode | Offloads video decoding from CPU |
| Dedicated NVENC | H.264 hardware encode | Efficient recording and restreaming |
| 4 GB LPDDR4 RAM | Shared CPU/GPU memory | Sufficient for several camera streams |
| Quad-core ARM Cortex-A57 | 1.43 GHz | Handles motion detection and orchestration |
| 5W / 10W power modes | `nvpmodel` configurable | Runs silently on passive cooling in 5W mode |

### Practical Projects

1. **Home Security NVR** — Monitor your home's cameras 24/7 with AI-powered alerts for people, vehicles, and animals. Integrate with Home Assistant to trigger automations (lights, alarms, notifications).

2. **Driveway / Parking Monitor** — Detect vehicles entering and leaving with object detection zones. Configure Frigate to only record when relevant activity is detected.

3. **Pet / Wildlife Monitor** — Use object detection to identify animals and birds in your yard. Frigate's classification capabilities can distinguish between different types.

4. **Package Delivery Detection** — Set up zones near your front door and get notifications when a person is detected in the delivery area.

5. **Business Surveillance** — Run a small-office NVR with 2-3 cameras, real-time RTSP restreaming for remote viewing, and retention-based recording.

6. **Edge AI Prototype** — Use the Jetson Nano B01 as a development platform for experimenting with custom YOLO models and TensorRT optimization.

## Prerequisites

- **NVIDIA Jetson Nano B01** (4GB variant recommended)
- **MicroSD card** (64GB+ UHS-I recommended) or NVMe SSD via USB adapter for better I/O performance
- **Power supply**: 5V/4A barrel jack (not micro-USB) for stable operation under load
- **JetPack 4.6.x** flashed on the device ([NVIDIA SDK Manager](https://developer.nvidia.com/sdk-manager) or [SD card image](https://developer.nvidia.com/jetson-nano-sd-card-image))
- **Ethernet connection** (WiFi adapters work but wired is strongly recommended for camera streams)
- **IP cameras** that output H.264 (recommended) or H.265 streams

:::warning

The Jetson Nano B01 runs JetPack 4.x (L4T 32.x) which uses CUDA 10.2. The primary Frigate Jetson image (`stable-tensorrt-jp6`) targets JetPack 6 / L4T 36.x for Orin-series devices. For the original Jetson Nano, you may need to build a custom image or use the ONNX/CPU detector path. Check [community resources and discussions](https://github.com/blakeblackshear/frigate/discussions) for JetPack 4.x compatibility.

:::

## Installation

### Step 1: Install Docker and NVIDIA Container Runtime

If you flashed JetPack via the SDK Manager, Docker and the NVIDIA runtime should already be installed. Verify:

```bash
docker --version
sudo docker run --runtime nvidia --rm nvidia/cuda:10.2-base nvidia-smi
```

If the NVIDIA runtime is not configured, install it:

```bash
sudo apt-get update
sudo apt-get install -y nvidia-container-runtime
```

Add it to Docker's daemon configuration:

```json
{
    "runtimes": {
        "nvidia": {
            "path": "nvidia-container-runtime",
            "runtimeArgs": []
        }
    },
    "default-runtime": "nvidia"
}
```

Save this to `/etc/docker/daemon.json` and restart Docker:

```bash
sudo systemctl restart docker
```

### Step 2: Prepare Storage

Create directories for Frigate's configuration and media storage:

```bash
sudo mkdir -p /opt/frigate/config
sudo mkdir -p /opt/frigate/media
```

For better recording performance, consider using an external USB SSD mounted at `/opt/frigate/media`. Continuous recording to a microSD card will wear it out quickly.

### Step 3: Create Frigate Configuration

Create a minimal configuration file. This example uses the TensorRT detector and Jetson hardware decoding:

```yaml
mqtt:
  enabled: false

detectors:
  tensorrt:
    type: tensorrt
    device: 0

model:
  path: /config/model_cache/tensorrt/yolov7-tiny-416.trt
  input_tensor: nchw
  input_pixel_format: rgb
  width: 416
  height: 416
  labelmap_path: /labelmap/coco-80.txt

ffmpeg:
  hwaccel_args: preset-jetson-h264

cameras:
  front_door:
    ffmpeg:
      inputs:
        - path: rtsp://user:password@192.168.1.100:554/stream1
          roles:
            - detect
            - record
    detect:
      width: 1280
      height: 720
      fps: 5
    record:
      enabled: true
      retain:
        days: 3
        mode: motion
      events:
        retain:
          default: 14
          mode: active_objects
    motion:
      mask:
        - 0,0,250,0,250,250,0,250
```

Save this to `/opt/frigate/config/config.yml`.

:::tip

Use a smaller model like `yolov7-tiny-416` or `yolov4-tiny-416` on the Jetson Nano for the best balance of speed and accuracy. The tiny models run significantly faster on the 128-core Maxwell GPU.

:::

### Step 4: Run Frigate with Docker Compose

Create a `docker-compose.yml`:

```yaml
services:
  frigate:
    container_name: frigate
    restart: unless-stopped
    image: ghcr.io/blakeblackshear/frigate:stable-tensorrt-jp6
    runtime: nvidia
    shm_size: "128mb"
    volumes:
      - /opt/frigate/config:/config
      - /opt/frigate/media:/media/frigate
      - type: tmpfs
        target: /tmp/cache
        tmpfs:
          size: 1000000000
    ports:
      - "8971:8971"
      - "5000:5000"
      - "8554:8554"
      - "8555:8555/tcp"
      - "8555:8555/udp"
    environment:
      - YOLO_MODELS=yolov7-tiny-416
      - USE_FP16=true
```

Start Frigate:

```bash
cd /opt/frigate
docker compose up -d
```

The first startup will take several minutes as TensorRT builds the optimized model engine for your specific GPU.

### Step 5: Verify Hardware Acceleration

Install `jetson-stats` on the host to monitor GPU and media engine utilization:

```bash
sudo pip3 install -U jetson-stats
sudo jtop
```

In `jtop`, you should see:
- **NVDEC** showing activity (hardware video decoding is working)
- **GPU** showing utilization (TensorRT inference is running on GPU)

## Performance Tuning

### Power Mode

The Jetson Nano B01 supports two power modes. For best Frigate performance, use the 10W mode:

```bash
sudo nvpmodel -m 0   # 10W mode (all 4 CPU cores, full GPU clock)
sudo jetson_clocks    # maximize clock speeds
```

Use 5W mode (`-m 1`) if power consumption or heat is a concern, at the cost of reduced throughput.

### Camera Stream Configuration

- Set your camera's **detect stream** to 720p at 5 FPS. Higher resolutions and frame rates require proportionally more processing power.
- Use a **separate substream** for detection (720p/5fps) and a main stream for recording (1080p/15fps) to balance quality and performance.
- Use H.264 encoding on your cameras when possible; H.265 decoding is supported but H.264 is more broadly compatible.

### Model Selection

| Model | Resolution | Approx. Inference Time | Best For |
| --- | --- | --- | --- |
| yolov4-tiny-288 | 288x288 | ~15-20 ms | Maximum FPS, lower accuracy |
| yolov4-tiny-416 | 416x416 | ~20-30 ms | Good balance for Nano |
| yolov7-tiny-416 | 416x416 | ~25-35 ms | Better accuracy, still fast |
| yolov7-320 | 320x320 | ~30-40 ms | Good accuracy at lower res |

:::note

Inference times are approximate and depend on the `nvpmodel` power mode, thermal conditions, and whether FP16 is enabled. The Jetson Nano's Maxwell GPU supports FP16 but does not have dedicated Tensor Cores, so FP16 gains are modest compared to newer Jetson models.

:::

### Memory Management

The Jetson Nano B01 has 4 GB of shared CPU/GPU memory. To avoid out-of-memory issues:

- Limit the number of cameras to 2-4 depending on resolution
- Use `detect` resolution of 720p or lower
- Set `shm_size` appropriately (see the [calculating shm-size](/frigate/installation#calculating-required-shm-size) documentation)
- Monitor memory usage with `jtop` or `free -h`

## Using ONNX Detector as an Alternative

If you prefer the ONNX detector path (which auto-detects and uses the GPU in the `-tensorrt-jp6` image), you can configure it as follows:

```yaml
detectors:
  onnx:
    type: onnx

model:
  model_type: yolov9-tiny
  width: 320
  height: 320
```

The ONNX detector will automatically use CUDA (GPU acceleration) when running in the TensorRT Frigate image. This approach can be simpler as it doesn't require pre-generating `.trt` model files.

## Limitations

- **No DLA**: The Jetson Nano does not have Deep Learning Accelerators (DLAs). DLA-accelerated models are only available on Xavier and Orin series.
- **JetPack version**: The Jetson Nano B01 maxes out at JetPack 4.6.x. The primary Frigate Jetson image targets JetPack 6. Check community discussions for compatibility options.
- **Limited memory**: 4 GB shared memory limits the number of simultaneous camera streams and model size.
- **No NVENC on some SKUs**: Verify your specific Nano variant supports hardware encoding. The 2GB Jetson Nano variant has more limited capabilities.
- **Thermal throttling**: Under sustained load without adequate cooling, the GPU and CPU will throttle. Use a fan or heatsink for best sustained performance.

## Troubleshooting

### Model generation fails or takes very long

TensorRT model compilation is expected to take 5-15 minutes on the Jetson Nano. If it fails, check:
- Available disk space (models can be several hundred MB)
- Memory availability (`free -h`)
- Docker logs: `docker logs frigate`

### ffmpeg errors with nvmpi

Ensure the NVIDIA container runtime is properly configured and the correct image tag is used. Run inside the container to verify codec availability:

```bash
docker exec -it frigate ffmpeg -decoders | grep nvmpi
```

You should see `h264_nvmpi` and `hevc_nvmpi` listed.

### High CPU usage despite hardware acceleration

- Verify `hwaccel_args: preset-jetson-h264` is set in your config
- Check that the detect stream resolution matches what you configured (avoid unnecessary scaling)
- Reduce detect FPS if CPU is still saturated

### Container exits with "Bus error"

Increase the `shm_size` in your Docker Compose configuration. See the [shm-size calculation guide](/frigate/installation#calculating-required-shm-size).

## Further Reading

- [Frigate Hardware Recommendations](/frigate/hardware#nvidia-jetson)
- [Hardware Accelerated Video Decoding — Jetson](/configuration/hardware_acceleration_video#nvidia-jetson)
- [TensorRT Detector Configuration](/configuration/object_detectors#nvidia-tensorrt-detector)
- [ONNX Detector Configuration](/configuration/object_detectors#onnx)
- [Frigate Community Discussions](https://github.com/blakeblackshear/frigate/discussions)
