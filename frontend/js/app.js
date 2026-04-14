class GestureGraphApp {
  constructor() {
    this.graph = null;
    this.gestureController = null;
    this.graphData = null;
    this.selectedNode = null;
    this.cameraOffset = { x: 0, y: 0 };
    this.isDragging = false;
    this.hoverNode = null;

    this.API_BASE = window.location.origin + '/api';
  }

  async init() {
    this._updateStatus('正在初始化3D图谱...');
    await this._initGraph();
    await this._loadGraphData();
    this._updateStatus('图谱加载完成，请开启摄像头');
    this._bindEvents();
  }

  async _initGraph() {
    const container = document.getElementById('graph-container');

    this.graph = ForceGraph3D()(container)
      .backgroundColor('#0a0a1a')
      .nodeLabel(node => `${node.name} (${node.label})`)
      .nodeColor(node => this._getNodeColor(node))
      .nodeVal(node => node.val || 1)
      .nodeResolution(16)
      .linkColor(() => 'rgba(100, 150, 255, 0.3)')
      .linkWidth(0.5)
      .linkDirectionalArrowLength(3.5)
      .linkDirectionalArrowRelPos(1)
      .linkCurvature(0.1)
      .linkDirectionalParticles(2)
      .linkDirectionalParticleWidth(1.5)
      .onNodeClick(node => this._selectNode(node))
      .onNodeHover(node => this._onNodeHover(node))
      .d3AlphaDecay(0.02)
      .d3VelocityDecay(0.3)
      .warmupTicks(50)
      .cooldownTime(3000);

    this.graph.width(container.clientWidth);
    this.graph.height(container.clientHeight);

    window.addEventListener('resize', () => {
      this.graph.width(container.clientWidth);
      this.graph.height(container.clientHeight);
    });
  }

  async _loadGraphData() {
    try {
      const response = await fetch(`${this.API_BASE}/graph`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      this.graphData = data;
      this.graph.graphData(data);
      this._updateStatus(`已加载 ${data.nodes.length} 个节点, ${data.links.length} 条关系`);
    } catch (err) {
      console.warn('API加载失败，使用演示数据:', err);
      this.graphData = this._getDemoData();
      this.graph.graphData(this.graphData);
      this._updateStatus(`演示模式: ${this.graphData.nodes.length} 个节点`);
    }
  }

  async _selectNode(node) {
    this.selectedNode = node;
    const sidebar = document.getElementById('sidebar');
    const content = document.getElementById('sidebar-content');

    content.innerHTML = '<div class="loading">加载中...</div>';
    sidebar.classList.add('open');

    try {
      const response = await fetch(`${this.API_BASE}/node/${encodeURIComponent(node.id)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const detail = await response.json();
      this._renderNodeDetail(detail);
    } catch (err) {
      console.warn('节点详情加载失败，使用本地数据:', err);
      this._renderNodeDetail(this._getLocalNodeDetail(node));
    }

    this._highlightNode(node);
  }

  _renderNodeDetail(detail) {
    const content = document.getElementById('sidebar-content');
    const propsHtml = detail.properties
      ? Object.entries(detail.properties)
          .map(([k, v]) => `<div class="prop-item"><span class="prop-key">${k}</span><span class="prop-val">${v}</span></div>`)
          .join('')
      : '<p>无属性</p>';

    const relsHtml = detail.relationships && detail.relationships.length > 0
      ? detail.relationships
          .map(r => `<div class="rel-item"><span class="rel-type">${r.type}</span><span class="rel-target">${r.target}</span></div>`)
          .join('')
      : '<p>无关联关系</p>';

    content.innerHTML = `
      <div class="node-detail">
        <div class="detail-header">
          <span class="detail-label" style="background:${this._getNodeColor({ label: detail.label })}">${detail.label}</span>
          <h2 class="detail-name">${detail.name}</h2>
        </div>
        <div class="detail-section">
          <h3>属性</h3>
          <div class="props-list">${propsHtml}</div>
        </div>
        <div class="detail-section">
          <h3>关联关系</h3>
          <div class="rels-list">${relsHtml}</div>
        </div>
      </div>
    `;
  }

  _getLocalNodeDetail(node) {
    const relationships = [];
    if (this.graphData) {
      this.graphData.links.forEach(link => {
        if (link.source.id === node.id) {
          relationships.push({ type: link.label || 'RELATED', target: link.target.name || link.target });
        } else if (link.target.id === node.id) {
          relationships.push({ type: link.label || 'RELATED', target: link.source.name || link.source });
        }
      });
    }
    return {
      id: node.id,
      name: node.name,
      label: node.label,
      properties: node.properties || { name: node.name },
      relationships: relationships
    };
  }

  _highlightNode(node) {
    if (!this.graphData) return;
    const connectedNodes = new Set();
    const connectedLinks = new Set();

    this.graphData.links.forEach((link, idx) => {
      const sourceId = link.source.id || link.source;
      const targetId = link.target.id || link.target;
      if (sourceId === node.id || targetId === node.id) {
        connectedNodes.add(sourceId);
        connectedNodes.add(targetId);
        connectedLinks.add(idx);
      }
    });

    this.graph
      .nodeColor(n => {
        if (n.id === node.id) return '#ffff00';
        if (connectedNodes.has(n.id)) return this._getNodeColor(n);
        return '#333344';
      })
      .linkColor((link, idx) => {
        if (connectedLinks.has(idx)) return 'rgba(255, 255, 100, 0.6)';
        return 'rgba(50, 50, 80, 0.15)';
      })
      .linkWidth((link, idx) => connectedLinks.has(idx) ? 2 : 0.3)
      .linkDirectionalParticleWidth((link, idx) => connectedLinks.has(idx) ? 3 : 0);
  }

  _resetHighlight() {
    this.graph
      .nodeColor(node => this._getNodeColor(node))
      .linkColor(() => 'rgba(100, 150, 255, 0.3)')
      .linkWidth(0.5)
      .linkDirectionalParticleWidth(1.5);
  }

  _onNodeHover(node) {
    this.hoverNode = node;
    document.getElementById('graph-container').style.cursor = node ? 'pointer' : 'default';
  }

  _getNodeColor(node) {
    const colorMap = {
      'Person': '#ff6b6b',
      'Organization': '#4ecdc4',
      'Technology': '#45b7d1',
      'Concept': '#96ceb4',
      'Event': '#ffeaa7',
      'Location': '#dda0dd',
      'Product': '#98d8c8',
      'Category': '#f7dc6f'
    };
    return colorMap[node.label] || '#6c5ce7';
  }

  async initGesture() {
    const videoEl = document.getElementById('gesture-video');
    const canvasEl = document.getElementById('gesture-canvas');

    this.gestureController = new GestureController({
      easingFactor: 0.1,
      deadZone: 0.005,
      panScale: 800,
      onGestureUpdate: (data) => this._handleGesture(data),
      onStatusChange: (status) => this._updateGestureStatus(status)
    });

    try {
      this._updateStatus('正在初始化手势识别...');
      await this.gestureController.init(videoEl, canvasEl);
      this.gestureController.start();
      this._updateStatus('手势识别已启动 - 张开手掌漫游，握拳选择');
    } catch (err) {
      console.error('手势识别初始化失败:', err);
      this._updateStatus('手势识别初始化失败，请检查摄像头权限');
    }
  }

  _handleGesture(data) {
    const gestureIndicator = document.getElementById('gesture-indicator');
    const vectorDisplay = document.getElementById('vector-display');

    if (gestureIndicator) {
      gestureIndicator.className = `gesture-indicator ${data.state.toLowerCase()}`;
      gestureIndicator.textContent = this._getGestureLabel(data.state);
    }

    if (vectorDisplay) {
      vectorDisplay.textContent = `dx: ${data.dx.toFixed(2)} | dy: ${data.dy.toFixed(2)}`;
    }

    if (data.state === 'OPEN_PALM' && (Math.abs(data.dx) > 0.1 || Math.abs(data.dy) > 0.1)) {
      this._panCamera(data.dx, data.dy);
    }

    if (data.selectTriggered) {
      this._handleSelect(data.palmCenter);
    }
  }

  _panCamera(dx, dy) {
    if (!this.graph) return;
    const camera = this.graph.camera();
    camera.position.x -= dx;
    camera.position.y += dy;
    camera.lookAt(camera.position.x, camera.position.y, 0);
  }

  _handleSelect(palmCenter) {
    if (!palmCenter) return;
    const graphContainer = document.getElementById('graph-container');
    const rect = graphContainer.getBoundingClientRect();

    const screenX = (1 - palmCenter.x) * rect.width;
    const screenY = palmCenter.y * rect.height;

    const node = this._findNodeAtScreen(screenX, screenY);
    if (node) {
      this._selectNode(node);
    }
  }

  _findNodeAtScreen(x, y) {
    if (this.hoverNode) return this.hoverNode;
    return null;
  }

  _getGestureLabel(state) {
    const labels = {
      'OPEN_PALM': '🖐 漫游',
      'CLOSED_FIST': '✊ 选择',
      'PARTIAL': '🤏 过渡',
      'NONE': '👋 未检测'
    };
    return labels[state] || state;
  }

  _updateGestureStatus(status) {
    const el = document.getElementById('gesture-status');
    if (el) el.textContent = `手势: ${status}`;
  }

  _updateStatus(msg) {
    const el = document.getElementById('status-bar');
    if (el) el.textContent = msg;
    console.log('[GestureGraph]', msg);
  }

  _bindEvents() {
    document.getElementById('btn-close-sidebar').addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('open');
      this.selectedNode = null;
      this._resetHighlight();
    });

    document.getElementById('btn-start-gesture').addEventListener('click', () => {
      this.initGesture();
      document.getElementById('btn-start-gesture').disabled = true;
      document.getElementById('gesture-panel').classList.add('active');
    });

    document.getElementById('btn-reset-camera').addEventListener('click', () => {
      if (this.graph) {
        this.graph.cameraPosition({ x: 0, y: 0, z: 500 }, { x: 0, y: 0, z: 0 }, 1000);
      }
    });

    document.getElementById('btn-reload').addEventListener('click', () => {
      this._loadGraphData();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.getElementById('sidebar').classList.remove('open');
        this.selectedNode = null;
        this._resetHighlight();
      }
    });
  }

  _getDemoData() {
    const nodes = [
      { id: 'n1', name: '人工智能', label: 'Concept', val: 10, properties: { description: '计算机科学的一个分支' } },
      { id: 'n2', name: '机器学习', label: 'Technology', val: 8, properties: { description: 'AI的核心子领域' } },
      { id: 'n3', name: '深度学习', label: 'Technology', val: 7, properties: { description: '基于神经网络的ML' } },
      { id: 'n4', name: '自然语言处理', label: 'Technology', val: 6, properties: { description: '理解和生成人类语言' } },
      { id: 'n5', name: '计算机视觉', label: 'Technology', val: 6, properties: { description: '使机器理解图像和视频' } },
      { id: 'n6', name: 'Transformer', label: 'Technology', val: 9, properties: { description: '基于注意力机制的架构' } },
      { id: 'n7', name: 'GPT', label: 'Product', val: 8, properties: { description: '生成式预训练模型' } },
      { id: 'n8', name: 'BERT', label: 'Product', val: 7, properties: { description: '双向编码器表示' } },
      { id: 'n9', name: '卷积神经网络', label: 'Technology', val: 5, properties: { description: 'CNN，用于图像处理' } },
      { id: 'n10', name: 'OpenAI', label: 'Organization', val: 8, properties: { description: 'AI研究公司' } },
      { id: 'n11', name: 'Google', label: 'Organization', val: 7, properties: { description: '科技巨头' } },
      { id: 'n12', name: 'Geoffrey Hinton', label: 'Person', val: 5, properties: { description: '深度学习之父' } },
      { id: 'n13', name: '强化学习', label: 'Technology', val: 5, properties: { description: '通过奖励信号学习' } },
      { id: 'n14', name: '知识图谱', label: 'Concept', val: 6, properties: { description: '结构化的知识表示' } },
      { id: 'n15', name: '图神经网络', label: 'Technology', val: 5, properties: { description: '处理图结构数据的NN' } },
      { id: 'n16', name: 'MediaPipe', label: 'Product', val: 4, properties: { description: 'Google开源的ML框架' } },
      { id: 'n17', name: '手势识别', label: 'Technology', val: 4, properties: { description: '通过摄像头识别手势' } },
      { id: 'n18', name: 'Neo4j', label: 'Product', val: 5, properties: { description: '图数据库' } },
      { id: 'n19', name: 'FastAPI', label: 'Product', val: 4, properties: { description: 'Python异步Web框架' } },
      { id: 'n20', name: 'WebGL', label: 'Technology', val: 3, properties: { description: '浏览器3D图形API' } }
    ];

    const links = [
      { source: 'n1', target: 'n2', label: '包含' },
      { source: 'n1', target: 'n4', label: '包含' },
      { source: 'n1', target: 'n5', label: '包含' },
      { source: 'n1', target: 'n13', label: '包含' },
      { source: 'n2', target: 'n3', label: '子领域' },
      { source: 'n2', target: 'n13', label: '子领域' },
      { source: 'n3', target: 'n6', label: '催生' },
      { source: 'n3', target: 'n9', label: '包含' },
      { source: 'n3', target: 'n15', label: '延伸' },
      { source: 'n4', target: 'n6', label: '依赖' },
      { source: 'n4', target: 'n8', label: '应用' },
      { source: 'n5', target: 'n9', label: '依赖' },
      { source: 'n5', target: 'n16', label: '应用' },
      { source: 'n6', target: 'n7', label: '架构' },
      { source: 'n6', target: 'n8', label: '架构' },
      { source: 'n7', target: 'n10', label: '开发' },
      { source: 'n8', target: 'n11', label: '开发' },
      { source: 'n9', target: 'n12', label: '先驱' },
      { source: 'n10', target: 'n7', label: '产品' },
      { source: 'n11', target: 'n16', label: '开发' },
      { source: 'n12', target: 'n3', label: '贡献' },
      { source: 'n14', target: 'n15', label: '驱动' },
      { source: 'n14', target: 'n18', label: '存储' },
      { source: 'n16', target: 'n17', label: '支持' },
      { source: 'n17', target: 'n5', label: '属于' },
      { source: 'n18', target: 'n19', label: '配合' },
      { source: 'n20', target: 'n5', label: '支撑' }
    ];

    return { nodes, links };
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new GestureGraphApp();
  window.app.init();
});
