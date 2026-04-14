class GestureController {
  constructor(options = {}) {
    this.videoElement = null;
    this.canvasElement = null;
    this.canvasCtx = null;
    this.handLandmarker = null;
    this.lastTimestamp = -1;
    this.running = false;

    this.onGestureUpdate = options.onGestureUpdate || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});

    this.gestureState = 'NONE';
    this.prevGestureState = 'NONE';

    this.prevPalmCenter = null;
    this.smoothDx = 0;
    this.smoothDy = 0;
    this.easingFactor = options.easingFactor || 0.1;
    this.deadZone = options.deadZone || 0.005;
    this.panScale = options.panScale || 800;

    this.fistThreshold = options.fistThreshold || 0.06;
    this.openThreshold = options.openThreshold || 0.12;

    this.FINGER_TIPS = [4, 8, 12, 16, 20];
    this.FINGER_MCPS = [2, 5, 9, 13, 17];
    this.PALM_CENTER = 9;
    this.WRIST = 0;
  }

  async init(videoElement, canvasElement) {
    this.videoElement = videoElement;
    this.canvasElement = canvasElement;
    this.canvasCtx = canvasElement.getContext('2d');

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' }
    });
    this.videoElement.srcObject = stream;
    await new Promise(resolve => {
      this.videoElement.onloadedmetadata = () => {
        this.videoElement.play();
        resolve();
      };
    });

    this.canvasElement.width = this.videoElement.videoWidth;
    this.canvasElement.height = this.videoElement.videoHeight;

    const { HandLandmarker, FilesetResolver } = await this._loadMediaPipe();
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
        delegate: 'GPU'
      },
      numHands: 1,
      runningMode: 'VIDEO',
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    this.onStatusChange('READY');
    return this;
  }

  async _loadMediaPipe() {
    const { HandLandmarker, FilesetResolver } = await import(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest'
    );
    return { HandLandmarker, FilesetResolver };
  }

  start() {
    if (!this.handLandmarker) {
      console.error('HandLandmarker not initialized. Call init() first.');
      return;
    }
    this.running = true;
    this.onStatusChange('RUNNING');
    this._processFrame();
  }

  stop() {
    this.running = false;
    this.onStatusChange('STOPPED');
  }

  _processFrame() {
    if (!this.running) return;

    const timestamp = performance.now();
    if (timestamp === this.lastTimestamp) {
      requestAnimationFrame(() => this._processFrame());
      return;
    }
    this.lastTimestamp = timestamp;

    const results = this.handLandmarker.detectForVideo(this.videoElement, timestamp);
    this._drawLandmarks(results);

    if (results.landmarks && results.landmarks.length > 0) {
      const landmarks = results.landmarks[0];
      this._processHandLandmarks(landmarks);
    } else {
      this._handleNoHand();
    }

    requestAnimationFrame(() => this._processFrame());
  }

  _processHandLandmarks(landmarks) {
    const gesture = this._classifyGesture(landmarks);
    this.prevGestureState = this.gestureState;
    this.gestureState = gesture;

    const palmCenter = landmarks[this.PALM_CENTER];
    const currentPos = { x: palmCenter.x, y: palmCenter.y };

    if (this.gestureState === 'OPEN_PALM') {
      if (this.prevPalmCenter) {
        let rawDx = (currentPos.x - this.prevPalmCenter.x) * this.panScale;
        let rawDy = (currentPos.y - this.prevPalmCenter.y) * this.panScale;

        if (Math.abs(rawDx) < this.deadZone * this.panScale) rawDx = 0;
        if (Math.abs(rawDy) < this.deadZone * this.panScale) rawDy = 0;

        this.smoothDx += (rawDx - this.smoothDx) * this.easingFactor;
        this.smoothDy += (rawDy - this.smoothDy) * this.easingFactor;
      }
      this.prevPalmCenter = currentPos;

      this.onGestureUpdate({
        state: 'OPEN_PALM',
        dx: this.smoothDx,
        dy: this.smoothDy,
        palmCenter: currentPos,
        selectTriggered: false
      });
    } else if (this.gestureState === 'CLOSED_FIST') {
      this.prevPalmCenter = null;
      this.smoothDx *= 0.8;
      this.smoothDy *= 0.8;

      const selectTriggered = this.prevGestureState === 'OPEN_PALM';

      this.onGestureUpdate({
        state: 'CLOSED_FIST',
        dx: this.smoothDx,
        dy: this.smoothDy,
        palmCenter: currentPos,
        selectTriggered: selectTriggered
      });
    } else {
      this.prevPalmCenter = null;
      this.onGestureUpdate({
        state: gesture,
        dx: 0,
        dy: 0,
        palmCenter: null,
        selectTriggered: false
      });
    }
  }

  _handleNoHand() {
    this.gestureState = 'NONE';
    this.prevPalmCenter = null;
    this.smoothDx *= 0.8;
    this.smoothDy *= 0.8;

    this.onGestureUpdate({
      state: 'NONE',
      dx: this.smoothDx,
      dy: this.smoothDy,
      palmCenter: null,
      selectTriggered: false
    });
  }

  _classifyGesture(landmarks) {
    const wrist = landmarks[this.WRIST];
    let extendedCount = 0;

    for (let i = 0; i < this.FINGER_TIPS.length; i++) {
      const tip = landmarks[this.FINGER_TIPS[i]];
      const mcp = landmarks[this.FINGER_MCPS[i]];
      const distTip = Math.sqrt(
        Math.pow(tip.x - wrist.x, 2) + Math.pow(tip.y - wrist.y, 2) + Math.pow(tip.z - wrist.z, 2)
      );
      const distMcp = Math.sqrt(
        Math.pow(mcp.x - wrist.x, 2) + Math.pow(mcp.y - wrist.y, 2) + Math.pow(mcp.z - wrist.z, 2)
      );
      if (distTip > distMcp + this.fistThreshold) {
        extendedCount++;
      }
    }

    if (extendedCount >= 4) return 'OPEN_PALM';
    if (extendedCount <= 1) return 'CLOSED_FIST';
    return 'PARTIAL';
  }

  _drawLandmarks(results) {
    this.canvasCtx.save();
    this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
    this.canvasCtx.drawImage(this.videoElement, 0, 0, this.canvasElement.width, this.canvasElement.height);

    if (results.landmarks && results.landmarks.length > 0) {
      const landmarks = results.landmarks[0];

      const connections = [
        [0,1],[1,2],[2,3],[3,4],
        [0,5],[5,6],[6,7],[7,8],
        [0,9],[9,10],[10,11],[11,12],
        [0,13],[13,14],[14,15],[15,16],
        [0,17],[17,18],[18,19],[19,20],
        [5,9],[9,13],[13,17]
      ];

      this.canvasCtx.strokeStyle = '#00ff88';
      this.canvasCtx.lineWidth = 2;
      for (const [a, b] of connections) {
        this.canvasCtx.beginPath();
        this.canvasCtx.moveTo(landmarks[a].x * this.canvasElement.width, landmarks[a].y * this.canvasElement.height);
        this.canvasCtx.lineTo(landmarks[b].x * this.canvasElement.width, landmarks[b].y * this.canvasElement.height);
        this.canvasCtx.stroke();
      }

      this.canvasCtx.fillStyle = '#ff4488';
      for (const lm of landmarks) {
        this.canvasCtx.beginPath();
        this.canvasCtx.arc(lm.x * this.canvasElement.width, lm.y * this.canvasElement.height, 4, 0, 2 * Math.PI);
        this.canvasCtx.fill();
      }

      const palm = landmarks[this.PALM_CENTER];
      this.canvasCtx.fillStyle = '#ffff00';
      this.canvasCtx.beginPath();
      this.canvasCtx.arc(palm.x * this.canvasElement.width, palm.y * this.canvasElement.height, 8, 0, 2 * Math.PI);
      this.canvasCtx.fill();

      this.canvasCtx.fillStyle = '#ffffff';
      this.canvasCtx.font = '16px monospace';
      this.canvasCtx.fillText(
        this.gestureState,
        10,
        25
      );
    }

    this.canvasCtx.restore();
  }

  destroy() {
    this.stop();
    if (this.videoElement && this.videoElement.srcObject) {
      this.videoElement.srcObject.getTracks().forEach(track => track.stop());
    }
    if (this.handLandmarker) {
      this.handLandmarker.close();
    }
  }
}

window.GestureController = GestureController;
