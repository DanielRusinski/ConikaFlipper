import { developmentService } from './DevelopmentService.js';
import { DevelopmentGraphRenderer } from './DevelopmentGraphRenderer.js';
import { NODE_STATES } from './DevelopmentEffectResolver.js';
import { developmentAudio } from './DevelopmentAudio.js';
import { BALL_COLORS, BALL_CSS_COLORS, BALL_DISPLAY_NAMES } from '../materials/ballMaterials.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { eventBus } from '../core/EventBus.js';
import { ballProgressionService } from '../progression/BallProgressionService.js';
import { renderIconHTML } from '../ui/IconService.js';

export class DevelopmentUI {
  constructor() {
    this._container = null;
    this._el = null;
    this._graphRenderer = null;
    this._selectedBall = 'brass';
    this._selectedNodeId = null;
    this._isOpen = false;
    this._unsubs = [];

    // Hold-to-charge mechanics
    this._isHolding = false;
    this._chargeProgress = 0.0;
    this._chargeSpeed = 1.0; // 1.0s to fully charge
    this._chargeAnimFrame = null;
    this._lastChargeTime = 0;
  }

  init(container) {
    this._container = container;

    this._el = document.createElement('div');
    this._el.id = 'dev-system-overlay';
    this._el.className = 'hidden';

    this._el.innerHTML = `
      <div class="dev-backdrop"></div>
      <div class="dev-window">
        <!-- Header -->
        <div class="dev-header">
          <div class="dev-title-group">
            <span class="dev-title-icon">${renderIconHTML('crystal', { size: '44px' })}</span>
            <h2 class="dev-title-text">SYSTEM ROZWOJU 3D (CRYSTARIUM)</h2>
            <div id="dev-stage-badge" class="dev-stage-badge">STAGE: 1 / 10</div>
            <div id="dev-ball-level-badge" class="dev-stage-badge" style="background:linear-gradient(135deg, #00f0ff, #0077b6); color:#fff; font-weight:800; border:1px solid #fff;">POZIOM KULI: Lv.1</div>
          </div>
          <div style="display:flex; align-items:center; gap:12px;">
            <div class="dev-score-display" style="background:rgba(0, 240, 255, 0.15); border:1px solid rgba(0, 240, 255, 0.4);">
              <span class="dev-score-label" style="color:#00f0ff;">PUNKTY UMIEJĘTNOŚCI (SP):</span>
              <span id="dev-sp-val" class="dev-score-val" style="color:#00ffcc;">0 SP</span>
            </div>
            <div class="dev-score-display">
              <span class="dev-score-label">DOSTĘPNY WYNIK:</span>
              <span id="dev-score-val" class="dev-score-val">0</span>
            </div>
            <button id="dev-close-btn" class="dev-close-btn" type="button" title="Zamknij">${renderIconHTML('close', { size: '28px' })}</button>
          </div>
        </div>

        <!-- Ball Selector Tabs -->
        <div id="dev-ball-selector" class="dev-ball-selector"></div>

        <!-- Main Body: 3D Graph & Sidebar -->
        <div class="dev-body">
          <div id="dev-graph-container" class="dev-graph-container">
            <div class="dev-graph-controls">
              <button id="dev-zoom-in" class="dev-graph-btn" type="button" title="Przybliż">${renderIconHTML('zoom_in', { size: '28px' })}</button>
              <button id="dev-zoom-out" class="dev-graph-btn" type="button" title="Oddal">${renderIconHTML('zoom_out', { size: '28px' })}</button>
              <button id="dev-reset-view" class="dev-graph-btn" type="button" title="Wyśrodkuj widok">${renderIconHTML('reset_view', { size: '28px' })}</button>
            </div>
          </div>

          <!-- Sidebar Details -->
          <div class="dev-sidebar">
            <div>
              <div id="dev-node-badge" class="dev-node-badge">WĘZEŁ BAZOWY</div>
              <h3 id="dev-node-title" class="dev-node-title">Wybierz węzeł</h3>
              <p id="dev-node-desc" class="dev-node-desc">Dotknij lub kliknij węzeł na grafie konstelacji 3D, aby zbadać ulepszenie.</p>

              <div class="dev-node-stat-box">
                <div class="dev-stat-row">
                  <span class="dev-stat-label">Koszt odblokowania:</span>
                  <span id="dev-node-cost" class="dev-stat-value">1 SP</span>
                </div>
                <div class="dev-stat-row">
                  <span class="dev-stat-label">Wymagany poziom kuli:</span>
                  <span id="dev-node-level-req" class="dev-stat-value">Poziom 1</span>
                </div>
                <div class="dev-stat-row">
                  <span class="dev-stat-label">Poziom węzła:</span>
                  <span id="dev-node-rank" class="dev-stat-value">0 / 1</span>
                </div>
                <div class="dev-stat-row">
                  <span class="dev-stat-label">Wymagany etap gry:</span>
                  <span id="dev-node-stage" class="dev-stat-value">STAGE 1</span>
                </div>
                <div class="dev-stat-row">
                  <span class="dev-stat-label">Stan:</span>
                  <span id="dev-node-state" class="dev-stat-value">ZABLOKOWANY</span>
                </div>
              </div>
            </div>

            <!-- Hold-to-charge action area -->
            <div class="dev-action-area">
              <button id="dev-hold-btn" class="dev-hold-btn" type="button">
                <div id="dev-hold-fill" class="dev-hold-fill"></div>
                <span id="dev-hold-text" class="dev-hold-btn-text">PRZYTRZYMAJ, ABY ODBLOKOWAĆ</span>
              </button>
              <div class="dev-progress-track">
                <div id="dev-progress-bar" class="dev-progress-bar"></div>
              </div>
              <div id="dev-unlock-reason" class="dev-unlock-reason" style="display:none;"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    this._container.appendChild(this._el);

    // Initialize 3D Three.js Graph Renderer
    const graphContainer = this._el.querySelector('#dev-graph-container');
    this._graphRenderer = new DevelopmentGraphRenderer(graphContainer);
    this._graphRenderer.nodeStateGetter = (nodeId, ballId) => developmentService.getNodeState(nodeId, ballId);
    this._graphRenderer.nodeRankGetter = (nodeId, ballId) => developmentService.getNodeRank(nodeId, ballId);
    this._graphRenderer.chargeProgressGetter = (nodeId) => developmentService.getChargeProgress(nodeId);
    this._graphRenderer.onNodeSelected = (nodeId) => this._onNodeSelected(nodeId);

    this._bindEvents();
    this._buildBallSelector();
  }

  _bindEvents() {
    const closeBtn = this._el.querySelector('#dev-close-btn');
    closeBtn.addEventListener('click', () => this.hide());

    const zoomIn = this._el.querySelector('#dev-zoom-in');
    zoomIn.addEventListener('click', () => this._graphRenderer.zoom(0.85));

    const zoomOut = this._el.querySelector('#dev-zoom-out');
    zoomOut.addEventListener('click', () => this._graphRenderer.zoom(1.15));

    const resetView = this._el.querySelector('#dev-reset-view');
    resetView.addEventListener('click', () => this._graphRenderer.resetView());

    // HOLD-TO-CHARGE BUTTON EVENTS (Pointer / Touch / Mouse)
    const holdBtn = this._el.querySelector('#dev-hold-btn');
    const onHoldStart = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      this._startHolding();
    };

    const onHoldEnd = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      this._stopHolding();
    };

    holdBtn.addEventListener('pointerdown', onHoldStart);
    window.addEventListener('pointerup', onHoldEnd);
    window.addEventListener('pointercancel', onHoldEnd);

    // Listen to node unlock notifications
    this._unsubs.push(
      eventBus.on('development:nodeUnlocked', () => {
        this._updateScoreDisplay();
        this._updateDetailsPanel();
      })
    );

    // Listen to external score changes
    this._unsubs.push(
      eventBus.on('score:changed', () => {
        if (this._isOpen) {
          this._updateScoreDisplay();
          this._updateDetailsPanel();
        }
      })
    );

    // Listen to stage changes
    this._unsubs.push(
      eventBus.on('development:stageChanged', () => {
        this._updateStageBadge();
        this._updateDetailsPanel();
      })
    );
  }

  _startHolding() {
    if (!this._selectedNodeId || this._isHolding) return;

    const state = developmentService.getNodeState(this._selectedNodeId, this._selectedBall);
    if (state !== NODE_STATES.AFFORDABLE) {
      developmentAudio.playError();
      return;
    }

    this._isHolding = true;
    this._lastChargeTime = performance.now();
    developmentAudio.startCharging();

    const holdBtn = this._el.querySelector('#dev-hold-btn');
    if (holdBtn) holdBtn.classList.add('charging');

    this._tickCharge();
  }

  _stopHolding() {
    if (!this._isHolding) return;
    this._isHolding = false;
    developmentAudio.stopCharging();

    const holdBtn = this._el.querySelector('#dev-hold-btn');
    if (holdBtn) holdBtn.classList.remove('charging');

    if (this._chargeAnimFrame) {
      cancelAnimationFrame(this._chargeAnimFrame);
      this._chargeAnimFrame = null;
    }

    // Reset progress back to 0 smoothly if released before completion
    this._chargeProgress = 0;
    if (this._selectedNodeId) {
      developmentService.setChargeProgress(this._selectedNodeId, 0);
    }
    this._updateProgressVisuals(0);
  }

  _tickCharge() {
    if (!this._isHolding) return;

    const now = performance.now();
    const dt = (now - this._lastChargeTime) / 1000;
    this._lastChargeTime = now;

    this._chargeProgress += dt * this._chargeSpeed;
    if (this._selectedNodeId) {
      developmentService.setChargeProgress(this._selectedNodeId, this._chargeProgress);
    }
    this._updateProgressVisuals(this._chargeProgress);

    if (this._chargeProgress >= 1.0) {
      // Completed unlock!
      this._isHolding = false;
      this._chargeProgress = 0;
      developmentAudio.stopCharging();

      const holdBtn = this._el.querySelector('#dev-hold-btn');
      if (holdBtn) holdBtn.classList.remove('charging');

      if (this._selectedNodeId) {
        developmentService.setChargeProgress(this._selectedNodeId, 1.0);
        const res = developmentService.unlockNode(this._selectedNodeId, this._selectedBall);
        if (res.success) {
          developmentAudio.playUnlock();
          this._findAndSelectNextAvailableNode();
        } else {
          developmentAudio.playError();
        }
      }
      this._updateProgressVisuals(0);
      return;
    }

    this._chargeAnimFrame = requestAnimationFrame(() => this._tickCharge());
  }

  _updateProgressVisuals(progress) {
    const fillEl = this._el.querySelector('#dev-hold-fill');
    const barEl = this._el.querySelector('#dev-progress-bar');
    const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));

    if (fillEl) fillEl.style.width = `${pct}%`;
    if (barEl) barEl.style.width = `${pct}%`;
  }

  _findAndSelectNextAvailableNode() {
    const tree = developmentService.getTree(this._selectedBall);
    if (!tree || !Array.isArray(tree.nodes)) return;

    const nextNode = tree.nodes.find(n => {
      const state = developmentService.getNodeState(n.id, this._selectedBall);
      return state === NODE_STATES.AFFORDABLE || state === NODE_STATES.AVAILABLE;
    });

    if (nextNode) {
      this._selectedNodeId = nextNode.id;
      if (this._graphRenderer) {
        this._graphRenderer.setSelectedNode(nextNode.id);
      }
      this._updateDetailsPanel();
    }
  }

  _buildBallSelector() {
    const selectorContainer = this._el.querySelector('#dev-ball-selector');
    if (!selectorContainer) return;

    selectorContainer.innerHTML = '';
    const ballTypes = GAME_CONFIG.ball.types || ['brass', 'marble', 'wood', 'chrome'];

    for (const ballType of ballTypes) {
      const tab = document.createElement('div');
      tab.className = `dev-ball-tab ${ballType === this._selectedBall ? 'active' : ''}`;
      tab.dataset.ball = ballType;

      const dotColor = BALL_CSS_COLORS[ballType] || '#ffd700';
      const displayName = BALL_DISPLAY_NAMES[ballType] || ballType;

      tab.innerHTML = `
        <span class="dev-ball-dot" style="background:${dotColor}; color:${dotColor};"></span>
        <span>${displayName}</span>
      `;

      tab.addEventListener('click', () => {
        this.selectBall(ballType);
      });

      selectorContainer.appendChild(tab);
    }
  }

  selectBall(ballType) {
    this._stopHolding();
    this._selectedBall = (ballType || 'brass').toLowerCase();
    developmentService.setSelectedBall(this._selectedBall);
    developmentAudio.playSelect();

    const tabs = this._el.querySelectorAll('.dev-ball-tab');
    tabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.ball === this._selectedBall);
    });

    const tree = developmentService.getTree(this._selectedBall);
    this._selectedNodeId = tree && tree.nodes && tree.nodes[0] ? tree.nodes[0].id : null;

    if (this._graphRenderer) {
      this._graphRenderer.setTree(tree, this._selectedBall, this._selectedNodeId);
    }

    this._updateScoreDisplay();
    this._updateStageBadge();
    this._updateDetailsPanel();
  }

  _onNodeSelected(nodeId) {
    this._stopHolding();
    this._selectedNodeId = nodeId;
    developmentAudio.playSelect();
    this._updateDetailsPanel();
  }

  _updateScoreDisplay() {
    const scoreVal = this._el.querySelector('#dev-score-val');
    if (scoreVal) {
      const score = developmentService.getAvailableScore();
      scoreVal.innerText = score.toLocaleString();
    }

    const spVal = this._el.querySelector('#dev-sp-val');
    const levelBadge = this._el.querySelector('#dev-ball-level-badge');
    const ballState = ballProgressionService.getBallState(this._selectedBall);

    if (spVal) {
      spVal.innerText = `${ballState.availableSkillPoints || 0} SP`;
    }
    if (levelBadge) {
      levelBadge.innerText = `POZIOM KULI: Lv.${ballState.level || 1}`;
    }
  }

  _updateStageBadge() {
    const stageBadge = this._el.querySelector('#dev-stage-badge');
    if (stageBadge) {
      const curStage = developmentService.getMaxUnlockedStage();
      stageBadge.innerText = `ODBLOKOWANY ETAP: STAGE ${curStage} / 10`;
    }
  }

  _updateDetailsPanel() {
    if (!this._selectedNodeId) return;
    const node = developmentService.getNode(this._selectedNodeId);
    if (!node) return;

    const badge = this._el.querySelector('#dev-node-badge');
    const title = this._el.querySelector('#dev-node-title');
    const desc = this._el.querySelector('#dev-node-desc');
    const cost = this._el.querySelector('#dev-node-cost');
    const rank = this._el.querySelector('#dev-node-rank');
    const stageEl = this._el.querySelector('#dev-node-stage');
    const stateEl = this._el.querySelector('#dev-node-state');
    const holdBtn = this._el.querySelector('#dev-hold-btn');
    const holdText = this._el.querySelector('#dev-hold-text');
    const reasonEl = this._el.querySelector('#dev-unlock-reason');

    const levelReqEl = this._el.querySelector('#dev-node-level-req');

    if (badge) badge.innerText = `${node.branch || 'OGÓLNY'} (${node.type})`;
    if (title) title.innerText = node.displayName;
    if (desc) desc.innerText = node.description;
    const spCost = node.spCost !== undefined ? node.spCost : 1;
    if (cost) cost.innerText = `${spCost} SP`;
    if (levelReqEl) levelReqEl.innerText = `Poziom ${node.requiredBallLevel || 1}`;

    const currentRank = developmentService.getNodeRank(node.id, this._selectedBall);
    const maxRank = node.maxRank || 1;
    if (rank) rank.innerText = `${currentRank} / ${maxRank}`;

    if (stageEl) {
      stageEl.innerText = `STAGE ${node.stage || 1}`;
    }

    const state = developmentService.getNodeState(node.id, this._selectedBall);
    const ballState = ballProgressionService.getBallState(this._selectedBall);
    if (stateEl) {
      let stateText = 'ZABLOKOWANY';
      let stateColor = '#888';
      switch (state) {
        case NODE_STATES.MAXED:
          stateText = 'MAKSYMALNY POZIOM';
          stateColor = '#00e5ff';
          break;
        case NODE_STATES.UNLOCKED:
          stateText = 'ODBLOKOWANY';
          stateColor = '#00ffaa';
          break;
        case NODE_STATES.AFFORDABLE:
          stateText = 'GOTOWY DO ODBLOKOWANIA';
          stateColor = '#ffd700';
          break;
        case NODE_STATES.AVAILABLE:
          stateText = 'BRAK PUNKTÓW SP';
          stateColor = '#ffaa00';
          break;
      }
      stateEl.innerText = stateText;
      stateEl.style.color = stateColor;
    }

    if (holdBtn && reasonEl && holdText) {
      reasonEl.style.display = 'none';
      if (state === NODE_STATES.AFFORDABLE) {
        holdBtn.disabled = false;
        holdText.innerText = 'PRZYTRZYMAJ, ABY ODBLOKOWAĆ';
      } else if (state === NODE_STATES.MAXED) {
        holdBtn.disabled = true;
        holdText.innerText = 'POZIOM MAKSYMALNY';
      } else if (state === NODE_STATES.UNLOCKED) {
        holdBtn.disabled = true;
        holdText.innerText = 'JUŻ ODBLOKOWANY';
      } else if (state === NODE_STATES.AVAILABLE) {
        holdBtn.disabled = true;
        holdText.innerText = 'BRAK PUNKTÓW SP';
        const neededSp = Math.max(0, spCost - (ballState.availableSkillPoints || 0));
        reasonEl.innerText = `Wymaga ${spCost} SP (brakujące: ${neededSp} SP)`;
        reasonEl.style.display = 'block';
      } else {
        holdBtn.disabled = true;
        holdText.innerText = 'WĘZEŁ ZABLOKOWANY';
        if (ballState.level < (node.requiredBallLevel || 1)) {
          reasonEl.innerText = `Wymagany poziom kuli: Poziom ${node.requiredBallLevel} (obecny: Poziom ${ballState.level})`;
        } else {
          reasonEl.innerText = 'Odblokuj najpierw połączone węzły poprzedzające';
        }
        reasonEl.style.display = 'block';
      }
    }
  }

  show(data = {}) {
    if (!this._el) return;
    this._isOpen = true;
    this._el.classList.remove('hidden');

    const ballToSelect = data.ball || developmentService.getSelectedBall();
    this.selectBall(ballToSelect);

    if (this._graphRenderer) {
      this._graphRenderer.resize();
      this._graphRenderer.startAnimationLoop();
    }

    eventBus.emit('development:open', { context: data.context || 'MENU' });
  }

  hide() {
    if (!this._el || !this._isOpen) return;
    this._stopHolding();
    this._isOpen = false;
    this._el.classList.add('hidden');

    if (this._graphRenderer) {
      this._graphRenderer.stopAnimationLoop();
    }

    eventBus.emit('development:close');
  }

  dispose() {
    this._stopHolding();
    for (const unsub of this._unsubs) {
      if (typeof unsub === 'function') unsub();
    }
    this._unsubs = [];
    if (this._graphRenderer) {
      this._graphRenderer.dispose();
    }
    if (this._el && this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
    this._el = null;
  }
}

export const developmentUI = new DevelopmentUI();
