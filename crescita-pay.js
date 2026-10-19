/**
 * CRESCITA PAY — Unified Payment System for Botswana
 * Supports: Orange Money, MyZaka (Mascom), Smega (BTC), Visa/Mastercard
 * 
 * Usage:
 *   const pay = new CrescitaPay({
 *     amount: 16.00,
 *     currency: 'BWP',
 *     reference: 'CTM-ABC12345',
 *     description: 'Bus Rank → Game City • 2 seats',
 *     merchant: 'CRESCITA Travel Mate',
 *     onSuccess: (receipt) => { console.log(receipt) },
 *     onCancel: () => {},
 *     apiBase: 'http://localhost:3000/api',
 *   });
 *   pay.open();
 */

(function (global) {
  'use strict';

  // ── STYLES ─────────────────────────────────────────────
  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&display=swap');

    .cpay-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(10, 24, 64, 0.72);
      backdrop-filter: blur(10px);
      display: flex; align-items: center; justify-content: center;
      padding: 16px;
      animation: cpay-fadein .22s ease;
    }
    @keyframes cpay-fadein { from { opacity:0 } to { opacity:1 } }

    .cpay-modal {
      background: #fff;
      border-radius: 20px;
      width: 100%;
      max-width: 440px;
      box-shadow: 0 32px 80px rgba(10,24,64,.35);
      overflow: hidden;
      animation: cpay-slide .28s cubic-bezier(.34,1.56,.64,1);
      font-family: 'DM Sans', sans-serif;
    }
    @keyframes cpay-slide { from { transform:translateY(28px);opacity:0 } to { transform:none;opacity:1 } }

    /* Header */
    .cpay-head {
      background: linear-gradient(135deg, #0c1f6e 0%, #1a3fa3 50%, #1d55c9 100%);
      padding: 22px 24px 20px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .cpay-brand { display: flex; align-items: center; gap: 11px; }
    .cpay-logo {
      width: 42px; height: 42px; border-radius: 10px;
      background: rgba(255,255,255,.15);
      border: 1.5px solid rgba(255,255,255,.25);
      display: flex; align-items: center; justify-content: center;
      font-family: 'Space Mono', monospace; font-size: 13px; font-weight: 700; color: #fff;
    }
    .cpay-brand-text { color: #fff; }
    .cpay-brand-text strong { display: block; font-size: 15px; font-weight: 700; letter-spacing: .02em; }
    .cpay-brand-text span { font-size: 11px; color: rgba(255,255,255,.55); letter-spacing: .04em; }
    .cpay-close {
      width: 32px; height: 32px; border-radius: 50%;
      background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.2);
      color: rgba(255,255,255,.8); font-size: 16px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background .2s;
    }
    .cpay-close:hover { background: rgba(255,255,255,.22); }

    /* Amount bar */
    .cpay-amount-bar {
      background: linear-gradient(135deg, #0a7c5c 0%, #059669 100%);
      padding: 14px 24px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .cpay-amount-label { font-size: 12px; color: rgba(255,255,255,.7); font-weight: 500; text-transform: uppercase; letter-spacing: .06em; }
    .cpay-amount-value { font-size: 28px; font-weight: 700; color: #fff; font-family: 'Space Mono', monospace; }
    .cpay-amount-desc { font-size: 12px; color: rgba(255,255,255,.65); margin-top: 2px; }
    .cpay-secure-badge {
      background: rgba(255,255,255,.15); border: 1px solid rgba(255,255,255,.25);
      border-radius: 50px; padding: 5px 12px;
      font-size: 11px; color: rgba(255,255,255,.8); font-weight: 600;
      display: flex; align-items: center; gap: 5px;
    }

    /* Body */
    .cpay-body { padding: 24px; }
    .cpay-screen { display: none; }
    .cpay-screen.active { display: block; animation: cpay-fadein .2s ease; }

    /* Method picker */
    .cpay-methods-title { font-size: 13px; font-weight: 700; color: #5c6f9e; text-transform: uppercase; letter-spacing: .07em; margin-bottom: 14px; }
    .cpay-methods { display: flex; flex-direction: column; gap: 10px; }
    .cpay-method {
      display: flex; align-items: center; gap: 14px;
      padding: 14px 16px; border-radius: 12px;
      border: 2px solid #e2e8f4; background: #f8faff;
      cursor: pointer; transition: all .2s;
    }
    .cpay-method:hover { border-color: #1a3fa3; background: #eff4ff; }
    .cpay-method.active { border-color: #1a3fa3; background: #eff4ff; }
    .cpay-method-ico {
      width: 46px; height: 46px; border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      font-size: 22px; flex-shrink: 0;
    }
    .cpay-method-ico.orange { background: #fff3e0; }
    .cpay-method-ico.myzaka { background: #e8f5e9; }
    .cpay-method-ico.smega  { background: #f3e5f5; }
    .cpay-method-ico.card   { background: #e3f2fd; }
    .cpay-method-info { flex: 1; }
    .cpay-method-name { font-size: 15px; font-weight: 700; color: #0d1b3e; }
    .cpay-method-sub  { font-size: 12px; color: #5c6f9e; margin-top: 2px; }
    .cpay-method-tag {
      font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 50px;
      text-transform: uppercase; letter-spacing: .06em;
    }
    .cpay-method-tag.instant { background: #dcfce7; color: #166534; }
    .cpay-method-tag.secure  { background: #dbeafe; color: #1d4ed8; }
    .cpay-check {
      width: 22px; height: 22px; border-radius: 50%; border: 2px solid #d0ddf5;
      flex-shrink: 0; transition: all .2s;
    }
    .cpay-method.active .cpay-check { background: #1a3fa3; border-color: #1a3fa3; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6L9 17l-5-5'/%3E%3C/svg%3E"); background-size: 14px; background-position: center; background-repeat: no-repeat; }

    /* Forms */
    .cpay-form { display: flex; flex-direction: column; gap: 14px; margin-top: 20px; }
    .cpay-field { display: flex; flex-direction: column; gap: 6px; }
    .cpay-label { font-size: 12px; font-weight: 700; color: #5c6f9e; text-transform: uppercase; letter-spacing: .06em; }
    .cpay-input {
      padding: 13px 16px; border-radius: 10px;
      border: 2px solid #e2e8f4; background: #f8faff;
      font-family: 'DM Sans', sans-serif; font-size: 15px; color: #0d1b3e;
      transition: border-color .2s, box-shadow .2s;
    }
    .cpay-input:focus { outline: none; border-color: #1a3fa3; box-shadow: 0 0 0 4px rgba(26,63,163,.1); background: #fff; }
    .cpay-input-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .cpay-phone-row { display: flex; gap: 10px; }
    .cpay-prefix {
      padding: 13px 14px; border-radius: 10px; border: 2px solid #e2e8f4;
      background: #eff4ff; color: #1a3fa3; font-weight: 700; font-size: 14px;
      flex-shrink: 0; white-space: nowrap;
    }
    .cpay-card-preview {
      background: linear-gradient(135deg, #0c1f6e, #1d55c9);
      border-radius: 12px; padding: 18px 20px; margin-top: 4px;
      display: flex; justify-content: space-between; align-items: flex-end;
    }
    .cpay-card-num { font-family: 'Space Mono', monospace; font-size: 14px; color: rgba(255,255,255,.8); letter-spacing: .12em; }
    .cpay-card-scheme { font-size: 22px; }

    /* Pay button */
    .cpay-pay-btn {
      width: 100%; padding: 16px; border-radius: 12px; margin-top: 20px;
      background: linear-gradient(135deg, #0a7c5c 0%, #059669 100%);
      color: #fff; font-size: 16px; font-weight: 700;
      box-shadow: 0 6px 20px rgba(5,150,105,.35);
      transition: opacity .2s, transform .2s, box-shadow .2s;
      display: flex; align-items: center; justify-content: center; gap: 8px;
    }
    .cpay-pay-btn:hover { opacity: .92; transform: translateY(-1px); box-shadow: 0 10px 28px rgba(5,150,105,.4); }
    .cpay-pay-btn:disabled { opacity: .5; cursor: not-allowed; transform: none; }
    .cpay-back-btn {
      width: 100%; padding: 12px; border-radius: 10px; margin-top: 10px;
      border: 2px solid #e2e8f4; background: transparent;
      color: #5c6f9e; font-size: 14px; font-weight: 600;
      transition: all .2s;
    }
    .cpay-back-btn:hover { border-color: #1a3fa3; color: #1a3fa3; }

    /* Processing screen */
    .cpay-processing {
      text-align: center; padding: 20px 10px 10px;
    }
    .cpay-spin-wrap { position: relative; width: 80px; height: 80px; margin: 0 auto 20px; }
    .cpay-spin {
      width: 80px; height: 80px; border-radius: 50%;
      border: 3px solid #e2e8f4; border-top-color: #1a3fa3;
      animation: cpay-spin 1s linear infinite;
    }
    .cpay-spin-ico {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      font-size: 28px;
    }
    @keyframes cpay-spin { to { transform: rotate(360deg); } }
    .cpay-proc-title { font-size: 20px; font-weight: 700; color: #0d1b3e; margin-bottom: 8px; }
    .cpay-proc-sub { font-size: 14px; color: #5c6f9e; line-height: 1.5; }
    .cpay-proc-steps { display: flex; flex-direction: column; gap: 8px; margin-top: 20px; text-align: left; }
    .cpay-proc-step {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 14px; border-radius: 10px; background: #f8faff;
      border: 1px solid #e2e8f4; font-size: 13px; color: #5c6f9e;
      transition: all .4s;
    }
    .cpay-proc-step.done { background: #f0fdf4; border-color: #bbf7d0; color: #166534; }
    .cpay-proc-step.active { background: #eff4ff; border-color: #bfdbfe; color: #1a3fa3; }
    .cpay-step-ico { font-size: 16px; flex-shrink: 0; }

    /* PIN pad screen (mobile money) */
    .cpay-pin-screen { text-align: center; padding: 10px 0; }
    .cpay-pin-phone { font-size: 20px; font-weight: 700; color: #0d1b3e; margin-bottom: 6px; font-family: 'Space Mono', monospace; }
    .cpay-pin-msg { font-size: 14px; color: #5c6f9e; margin-bottom: 20px; }
    .cpay-pin-display {
      display: flex; gap: 10px; justify-content: center; margin-bottom: 22px;
    }
    .cpay-pin-dot {
      width: 18px; height: 18px; border-radius: 50%;
      border: 2px solid #d0ddf5; background: transparent;
      transition: all .2s;
    }
    .cpay-pin-dot.filled { background: #1a3fa3; border-color: #1a3fa3; }
    .cpay-pin-pad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; max-width: 240px; margin: 0 auto; }
    .cpay-pin-key {
      padding: 14px; border-radius: 12px; background: #f0f5ff; border: 1.5px solid #e2e8f4;
      font-size: 18px; font-weight: 700; color: #0d1b3e; cursor: pointer;
      transition: all .15s;
    }
    .cpay-pin-key:hover { background: #e2ecff; border-color: #1a3fa3; }
    .cpay-pin-key:active { transform: scale(.94); }
    .cpay-pin-key.del { font-size: 14px; color: #5c6f9e; }
    .cpay-pin-key.empty { background: transparent; border: none; cursor: default; }

    /* Success screen */
    .cpay-success { text-align: center; padding: 10px 0; }
    .cpay-success-anim { font-size: 64px; margin-bottom: 14px; animation: cpay-pop .4s cubic-bezier(.34,1.56,.64,1); }
    @keyframes cpay-pop { from { transform: scale(0); opacity: 0 } to { transform: scale(1); opacity: 1 } }
    .cpay-success-title { font-size: 22px; font-weight: 700; color: #0d1b3e; margin-bottom: 6px; }
    .cpay-success-sub { font-size: 14px; color: #5c6f9e; margin-bottom: 20px; }
    .cpay-receipt {
      background: #f8faff; border-radius: 14px; padding: 18px;
      border: 1.5px solid #e2e8f4; text-align: left; margin-bottom: 18px;
    }
    .cpay-receipt-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 0; border-bottom: 1px solid #e2e8f4; font-size: 13px;
    }
    .cpay-receipt-row:last-child { border: none; }
    .cpay-receipt-lbl { color: #5c6f9e; font-weight: 500; }
    .cpay-receipt-val { font-weight: 700; color: #0d1b3e; font-family: 'Space Mono', monospace; font-size: 12px; }
    .cpay-receipt-val.green { color: #059669; font-size: 14px; }
    .cpay-receipt-header {
      display: flex; align-items: center; gap: 10px; margin-bottom: 14px;
      padding-bottom: 14px; border-bottom: 2px dashed #e2e8f4;
    }
    .cpay-receipt-logo {
      width: 36px; height: 36px; border-radius: 8px;
      background: linear-gradient(135deg, #0c1f6e, #1a3fa3);
      display: flex; align-items: center; justify-content: center;
      font-family: 'Space Mono', monospace; font-size: 11px; font-weight: 700; color: #fff;
    }
    .cpay-receipt-brand strong { display: block; font-size: 14px; font-weight: 700; color: #0d1b3e; }
    .cpay-receipt-brand span { font-size: 11px; color: #5c6f9e; }
    .cpay-done-btn {
      width: 100%; padding: 15px; border-radius: 12px;
      background: linear-gradient(135deg, #0c1f6e, #1a3fa3);
      color: #fff; font-size: 15px; font-weight: 700;
      box-shadow: 0 4px 16px rgba(26,63,163,.25);
      transition: opacity .2s;
    }
    .cpay-done-btn:hover { opacity: .9; }

    /* Footer */
    .cpay-foot {
      padding: 14px 24px; border-top: 1px solid #f0f5ff;
      display: flex; align-items: center; justify-content: center; gap: 8px;
      background: #fafbff;
    }
    .cpay-foot-txt { font-size: 11px; color: #8a9abe; font-weight: 500; }
    .cpay-foot-txt strong { color: #1a3fa3; }
    .cpay-methods-bar {
      display: flex; gap: 6px; align-items: center;
    }
    .cpay-method-chip {
      font-size: 10px; padding: 2px 8px; border-radius: 4px;
      background: #f0f5ff; color: #1a3fa3; font-weight: 600; border: 1px solid #e2e8f4;
    }

    @media (max-width: 480px) {
      .cpay-modal { border-radius: 16px 16px 0 0; position: fixed; bottom: 0; left: 0; right: 0; max-width: 100%; animation: cpay-up .28s cubic-bezier(.34,1.56,.64,1); }
      .cpay-overlay { align-items: flex-end; padding: 0; }
      @keyframes cpay-up { from { transform:translateY(100%) } to { transform:none } }
    }
  `;

  // ── INJECT STYLES ──────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('cpay-styles')) return;
    const style = document.createElement('style');
    style.id = 'cpay-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  // ── GENERATE TRANSACTION ID ───────────────────────────
  function genTxId() {
    return 'CPAY-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  // ── FORMAT PHONE ──────────────────────────────────────
  function fmtPhone(num) {
    const d = num.replace(/\D/g, '');
    if (d.length >= 8) return `+267 ${d.slice(0,2)} ${d.slice(2,5)} ${d.slice(5,8)}`;
    return '+267 ' + d;
  }

  // ── CARD FORMAT ───────────────────────────────────────
  function fmtCard(v) {
    return v.replace(/\D/g,'').slice(0,16).replace(/(.{4})/g,'$1 ').trim();
  }
  function detectScheme(num) {
    const n = num.replace(/\s/g,'');
    if (n.startsWith('4')) return '💳 Visa';
    if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return '💳 Mastercard';
    return '💳';
  }

  // ── MAIN CLASS ────────────────────────────────────────
  function CrescitaPay(options) {
    this.opts = Object.assign({
      amount: 0,
      currency: 'BWP',
      reference: genTxId(),
      description: 'CRESCITA Travel Mate',
      merchant: 'CRESCITA Travel Mate',
      apiBase: '',
      onSuccess: function(){},
      onCancel: function(){},
      onError: function(){},
    }, options);

    this._overlay = null;
    this._selectedMethod = null;
    this._pin = '';
    this._txId = genTxId();
  }

  CrescitaPay.prototype.open = function () {
    injectStyles();
    this._render();
    document.body.appendChild(this._overlay);
    document.body.style.overflow = 'hidden';
  };

  CrescitaPay.prototype.close = function () {
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
    document.body.style.overflow = '';
    this.opts.onCancel();
  };

  CrescitaPay.prototype._render = function () {
    const o = this.opts;
    const overlay = document.createElement('div');
    overlay.className = 'cpay-overlay';

    overlay.innerHTML = `
      <div class="cpay-modal" id="cpay-modal">

        <!-- Header -->
        <div class="cpay-head">
          <div class="cpay-brand">
            <div class="cpay-logo">CP</div>
            <div class="cpay-brand-text">
              <strong>CRESCITA PAY</strong>
              <span>SECURE · INSTANT · BOTSWANA</span>
            </div>
          </div>
          <button class="cpay-close" id="cpay-close">✕</button>
        </div>

        <!-- Amount -->
        <div class="cpay-amount-bar">
          <div>
            <div class="cpay-amount-label">Amount Due</div>
            <div class="cpay-amount-value">P ${o.amount.toFixed(2)}</div>
            <div class="cpay-amount-desc">${o.description}</div>
          </div>
          <div class="cpay-secure-badge">🔒 256-bit SSL</div>
        </div>

        <!-- Body -->
        <div class="cpay-body">

          <!-- SCREEN 1: Method select -->
          <div class="cpay-screen active" id="cpay-s1">
            <div class="cpay-methods-title">Select payment method</div>
            <div class="cpay-methods">
              <div class="cpay-method" data-method="orange" onclick="window._cpayInst.selectMethod('orange',this)">
                <div class="cpay-method-ico orange">🟠</div>
                <div class="cpay-method-info">
                  <div class="cpay-method-name">Orange Money</div>
                  <div class="cpay-method-sub">Push to phone • Enter PIN to confirm</div>
                </div>
                <span class="cpay-method-tag instant">Instant</span>
                <div class="cpay-check"></div>
              </div>
              <div class="cpay-method" data-method="myzaka" onclick="window._cpayInst.selectMethod('myzaka',this)">
                <div class="cpay-method-ico myzaka">📱</div>
                <div class="cpay-method-info">
                  <div class="cpay-method-name">MyZaka</div>
                  <div class="cpay-method-sub">Mascom mobile wallet • PIN confirmation</div>
                </div>
                <span class="cpay-method-tag instant">Instant</span>
                <div class="cpay-check"></div>
              </div>
              <div class="cpay-method" data-method="smega" onclick="window._cpayInst.selectMethod('smega',this)">
                <div class="cpay-method-ico smega">💜</div>
                <div class="cpay-method-info">
                  <div class="cpay-method-name">Smega</div>
                  <div class="cpay-method-sub">BTC mobile money • Instant payment</div>
                </div>
                <span class="cpay-method-tag instant">Instant</span>
                <div class="cpay-check"></div>
              </div>
              <div class="cpay-method" data-method="card" onclick="window._cpayInst.selectMethod('card',this)">
                <div class="cpay-method-ico card">💳</div>
                <div class="cpay-method-info">
                  <div class="cpay-method-name">Debit / Credit Card</div>
                  <div class="cpay-method-sub">Visa, Mastercard — secured by Stripe</div>
                </div>
                <span class="cpay-method-tag secure">Secured</span>
                <div class="cpay-check"></div>
              </div>
            </div>
          </div>

          <!-- SCREEN 2a: Mobile money phone entry -->
          <div class="cpay-screen" id="cpay-s2-mobile">
            <div class="cpay-form">
              <div class="cpay-field">
                <label class="cpay-label" id="cpay-mobile-label">Orange Money Number</label>
                <div class="cpay-phone-row">
                  <div class="cpay-prefix">🇧🇼 +267</div>
                  <input class="cpay-input" type="tel" id="cpay-phone" placeholder="71 234 567" maxlength="11"
                    oninput="this.value=this.value.replace(/[^0-9 ]/g,'')"/>
                </div>
              </div>
              <div class="cpay-field">
                <label class="cpay-label">Account Name (optional)</label>
                <input class="cpay-input" type="text" id="cpay-accname" placeholder="e.g. Kefilwe Gabanakgosi"/>
              </div>
            </div>
            <button class="cpay-pay-btn" onclick="window._cpayInst.sendMobilePush()">
              📲 Send Payment Request · P ${o.amount.toFixed(2)}
            </button>
            <button class="cpay-back-btn" onclick="window._cpayInst.goScreen('s1')">← Change Method</button>
          </div>

          <!-- SCREEN 2b: PIN pad -->
          <div class="cpay-screen" id="cpay-s2-pin">
            <div class="cpay-pin-screen">
              <div style="font-size:36px;margin-bottom:10px" id="cpay-method-emoji">🟠</div>
              <div class="cpay-pin-phone" id="cpay-pin-phone-display">+267 71 234 567</div>
              <div class="cpay-pin-msg">Enter your <strong id="cpay-pin-method-name">Orange Money</strong> PIN to confirm payment of <strong>P ${o.amount.toFixed(2)}</strong></div>
              <div class="cpay-pin-display" id="cpay-pin-dots">
                <div class="cpay-pin-dot"></div>
                <div class="cpay-pin-dot"></div>
                <div class="cpay-pin-dot"></div>
                <div class="cpay-pin-dot"></div>
                <div class="cpay-pin-dot"></div>
              </div>
              <div class="cpay-pin-pad">
                ${[1,2,3,4,5,6,7,8,9,'','0','⌫'].map(k => `
                  <button class="cpay-pin-key ${k===''?'empty':''} ${k==='⌫'?'del':''}"
                    onclick="window._cpayInst.pinKey('${k}')">${k}</button>
                `).join('')}
              </div>
            </div>
          </div>

          <!-- SCREEN 2c: Card form -->
          <div class="cpay-screen" id="cpay-s2-card">
            <div class="cpay-card-preview" id="cpay-card-preview">
              <div>
                <div style="font-size:11px;color:rgba(255,255,255,.5);margin-bottom:4px">CARD NUMBER</div>
                <div class="cpay-card-num" id="cpay-cnum-preview">•••• •••• •••• ••••</div>
              </div>
              <div class="cpay-card-scheme" id="cpay-scheme-ico">💳</div>
            </div>
            <div class="cpay-form">
              <div class="cpay-field">
                <label class="cpay-label">Name on Card</label>
                <input class="cpay-input" type="text" id="cpay-cname" placeholder="KEFILWE GABANAKGOSI"
                  style="text-transform:uppercase"/>
              </div>
              <div class="cpay-field">
                <label class="cpay-label">Card Number</label>
                <input class="cpay-input" type="text" id="cpay-cnum" placeholder="0000 0000 0000 0000" maxlength="19"
                  oninput="window._cpayInst.onCardNum(this)"/>
              </div>
              <div class="cpay-input-row">
                <div class="cpay-field">
                  <label class="cpay-label">Expiry</label>
                  <input class="cpay-input" type="text" id="cpay-cexp" placeholder="MM / YY" maxlength="7"
                    oninput="window._cpayInst.onExpiry(this)"/>
                </div>
                <div class="cpay-field">
                  <label class="cpay-label">CVV</label>
                  <input class="cpay-input" type="password" id="cpay-ccvv" placeholder="•••" maxlength="4"/>
                </div>
              </div>
            </div>
            <button class="cpay-pay-btn" onclick="window._cpayInst.processCard()">
              🔒 Pay P ${o.amount.toFixed(2)} Securely
            </button>
            <button class="cpay-back-btn" onclick="window._cpayInst.goScreen('s1')">← Change Method</button>
          </div>

          <!-- SCREEN 3: Processing -->
          <div class="cpay-screen" id="cpay-s3">
            <div class="cpay-processing">
              <div class="cpay-spin-wrap">
                <div class="cpay-spin"></div>
                <div class="cpay-spin-ico" id="cpay-proc-ico">🟠</div>
              </div>
              <div class="cpay-proc-title" id="cpay-proc-title">Processing Payment</div>
              <div class="cpay-proc-sub" id="cpay-proc-sub">Please wait while we confirm your payment</div>
              <div class="cpay-proc-steps" id="cpay-proc-steps"></div>
            </div>
          </div>

          <!-- SCREEN 4: Success -->
          <div class="cpay-screen" id="cpay-s4">
            <div class="cpay-success">
              <div class="cpay-success-anim">✅</div>
              <div class="cpay-success-title">Payment Successful!</div>
              <div class="cpay-success-sub">Your booking is confirmed. Keep your receipt below.</div>
              <div class="cpay-receipt" id="cpay-receipt"></div>
              <button class="cpay-done-btn" id="cpay-done-btn">Continue →</button>
            </div>
          </div>

        </div><!-- end body -->

        <!-- Footer -->
        <div class="cpay-foot">
          <span class="cpay-foot-txt">Powered by <strong>CRESCITA PAY</strong></span>
          <div class="cpay-methods-bar">
            <span class="cpay-method-chip">🟠 Orange</span>
            <span class="cpay-method-chip">📱 MyZaka</span>
            <span class="cpay-method-chip">💜 Smega</span>
            <span class="cpay-method-chip">💳 Card</span>
          </div>
        </div>

      </div><!-- end modal -->
    `;

    this._overlay = overlay;
    window._cpayInst = this;

    // Close handlers
    overlay.querySelector('#cpay-close').onclick = () => this.close();
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });
  };

  // ── SCREEN NAVIGATION ─────────────────────────────────
  CrescitaPay.prototype.goScreen = function (screenId) {
    this._overlay.querySelectorAll('.cpay-screen').forEach(s => s.classList.remove('active'));
    this._overlay.querySelector('#cpay-' + screenId).classList.add('active');
  };

  // ── METHOD SELECTION ──────────────────────────────────
  CrescitaPay.prototype.selectMethod = function (method, el) {
    this._overlay.querySelectorAll('.cpay-method').forEach(m => m.classList.remove('active'));
    el.classList.add('active');
    this._selectedMethod = method;

    if (method === 'card') {
      this.goScreen('s2-card');
    } else {
      const labels = { orange: 'Orange Money', myzaka: 'MyZaka (Mascom)', smega: 'Smega (BTC)' };
      const emojis = { orange: '🟠', myzaka: '📱', smega: '💜' };
      this._overlay.querySelector('#cpay-mobile-label').textContent = labels[method] + ' Number';
      this._overlay.querySelector('#cpay-phone').value = '';
      this.goScreen('s2-mobile');
    }
  };

  // ── CARD INPUT HANDLERS ───────────────────────────────
  CrescitaPay.prototype.onCardNum = function (el) {
    el.value = fmtCard(el.value);
    this._overlay.querySelector('#cpay-cnum-preview').textContent = el.value || '•••• •••• •••• ••••';
    this._overlay.querySelector('#cpay-scheme-ico').textContent = detectScheme(el.value);
  };

  CrescitaPay.prototype.onExpiry = function (el) {
    let v = el.value.replace(/\D/g,'');
    if (v.length >= 3) v = v.slice(0,2) + ' / ' + v.slice(2,4);
    el.value = v;
  };

  // ── MOBILE MONEY PUSH ─────────────────────────────────
  CrescitaPay.prototype.sendMobilePush = function () {
    const phone = this._overlay.querySelector('#cpay-phone').value.replace(/\s/g,'');
    if (phone.length < 7) {
      alert('Please enter a valid Botswana mobile number');
      return;
    }

    const emojis = { orange: '🟠', myzaka: '📱', smega: '💜' };
    const names  = { orange: 'Orange Money', myzaka: 'MyZaka', smega: 'Smega' };
    const method = this._selectedMethod;

    this._phone = phone;
    this._overlay.querySelector('#cpay-pin-phone-display').textContent = fmtPhone(phone);
    this._overlay.querySelector('#cpay-method-emoji').textContent = emojis[method];
    this._overlay.querySelector('#cpay-pin-method-name').textContent = names[method];
    this._pin = '';
    this._updatePinDots();
    this.goScreen('s2-pin');
  };

  // ── PIN PAD ───────────────────────────────────────────
  CrescitaPay.prototype.pinKey = function (key) {
    if (key === '⌫' || key === '') {
      if (key === '⌫') this._pin = this._pin.slice(0, -1);
      this._updatePinDots();
      return;
    }
    if (this._pin.length >= 5) return;
    this._pin += key;
    this._updatePinDots();

    if (this._pin.length === 5) {
      setTimeout(() => this._processMobilePay(), 500);
    }
  };

  CrescitaPay.prototype._updatePinDots = function () {
    const dots = this._overlay.querySelectorAll('.cpay-pin-dot');
    dots.forEach((d, i) => d.classList.toggle('filled', i < this._pin.length));
  };

  // ── PROCESS MOBILE MONEY ─────────────────────────────
  CrescitaPay.prototype._processMobilePay = function () {
    const names = { orange: 'Orange Money', myzaka: 'MyZaka', smega: 'Smega' };
    const emojis = { orange: '🟠', myzaka: '📱', smega: '💜' };
    const method = this._selectedMethod;

    this._overlay.querySelector('#cpay-proc-ico').textContent = emojis[method];
    this._overlay.querySelector('#cpay-proc-title').textContent = 'Confirming Payment';
    this._overlay.querySelector('#cpay-proc-sub').textContent = `Verifying your ${names[method]} PIN...`;
    this.goScreen('s3');
    this._runProcessingSteps([
      { ico: '📡', text: `Connecting to ${names[method]} gateway...`, delay: 0 },
      { ico: '🔐', text: 'Verifying PIN securely...', delay: 900 },
      { ico: '💸', text: `Debiting P${this.opts.amount.toFixed(2)} from wallet...`, delay: 1900 },
      { ico: '✅', text: 'Payment confirmed!', delay: 2900 },
    ], () => this._showSuccess());
  };

  // ── PROCESS CARD ──────────────────────────────────────
  CrescitaPay.prototype.processCard = function () {
    const name = this._overlay.querySelector('#cpay-cname').value.trim();
    const num  = this._overlay.querySelector('#cpay-cnum').value.replace(/\s/g,'');
    const exp  = this._overlay.querySelector('#cpay-cexp').value;
    const cvv  = this._overlay.querySelector('#cpay-ccvv').value;

    if (!name) { alert('Please enter the name on your card'); return; }
    if (num.length < 16) { alert('Please enter a valid 16-digit card number'); return; }
    if (exp.length < 4)  { alert('Please enter card expiry date'); return; }
    if (cvv.length < 3)  { alert('Please enter your CVV'); return; }

    this._overlay.querySelector('#cpay-proc-ico').textContent = '💳';
    this._overlay.querySelector('#cpay-proc-title').textContent = 'Processing Card Payment';
    this._overlay.querySelector('#cpay-proc-sub').textContent = 'Connecting to payment gateway...';
    this.goScreen('s3');
    this._runProcessingSteps([
      { ico: '🔗', text: 'Connecting to Stripe gateway...', delay: 0 },
      { ico: '🔐', text: 'Encrypting card details...', delay: 800 },
      { ico: '🏦', text: 'Authorizing with card issuer...', delay: 1800 },
      { ico: '✅', text: 'Payment authorized!', delay: 2900 },
    ], () => this._showSuccess());
  };

  // ── PROCESSING STEPS ANIMATION ────────────────────────
  CrescitaPay.prototype._runProcessingSteps = function (steps, onDone) {
    const container = this._overlay.querySelector('#cpay-proc-steps');
    container.innerHTML = steps.map(s =>
      `<div class="cpay-proc-step" data-step><span class="cpay-step-ico">${s.ico}</span>${s.text}</div>`
    ).join('');
    const stepEls = container.querySelectorAll('[data-step]');

    steps.forEach((s, i) => {
      setTimeout(() => {
        stepEls.forEach(el => el.classList.remove('active'));
        stepEls[i].classList.add('active');
        if (i > 0) stepEls[i-1].classList.add('done');
        if (i === steps.length - 1) {
          stepEls[i].classList.add('done');
          setTimeout(onDone, 600);
        }
      }, s.delay);
    });
  };

  // ── SUCCESS SCREEN ────────────────────────────────────
  CrescitaPay.prototype._showSuccess = function () {
    const o    = this.opts;
    const txId = this._txId;
    const method = this._selectedMethod;
    const methodNames = { orange:'Orange Money', myzaka:'MyZaka', smega:'Smega', card:'Card' };
    const now  = new Date().toLocaleString('en-BW', { dateStyle:'medium', timeStyle:'short' });

    const receipt = this._overlay.querySelector('#cpay-receipt');
    receipt.innerHTML = `
      <div class="cpay-receipt-header">
        <div class="cpay-receipt-logo">CP</div>
        <div class="cpay-receipt-brand">
          <strong>CRESCITA PAY</strong>
          <span>Official Payment Receipt</span>
        </div>
      </div>
      <div class="cpay-receipt-row">
        <span class="cpay-receipt-lbl">Transaction ID</span>
        <span class="cpay-receipt-val">${txId}</span>
      </div>
      <div class="cpay-receipt-row">
        <span class="cpay-receipt-lbl">Booking Ref</span>
        <span class="cpay-receipt-val">${o.reference}</span>
      </div>
      <div class="cpay-receipt-row">
        <span class="cpay-receipt-lbl">Description</span>
        <span class="cpay-receipt-val" style="font-family:'DM Sans',sans-serif;font-size:13px">${o.description}</span>
      </div>
      <div class="cpay-receipt-row">
        <span class="cpay-receipt-lbl">Method</span>
        <span class="cpay-receipt-val" style="font-family:'DM Sans',sans-serif">${methodNames[method] || method}${this._phone ? ' (+267 ' + this._phone.slice(0,2) + '•••' + this._phone.slice(-3) + ')' : ''}</span>
      </div>
      <div class="cpay-receipt-row">
        <span class="cpay-receipt-lbl">Date & Time</span>
        <span class="cpay-receipt-val" style="font-family:'DM Sans',sans-serif;font-size:12px">${now}</span>
      </div>
      <div class="cpay-receipt-row">
        <span class="cpay-receipt-lbl">Amount Paid</span>
        <span class="cpay-receipt-val green">P ${o.amount.toFixed(2)} BWP</span>
      </div>
    `;

    this.goScreen('s4');

    const receiptData = {
      txId, reference: o.reference, amount: o.amount,
      currency: o.currency, method, description: o.description,
      timestamp: new Date().toISOString(),
      status: 'SUCCESS',
    };

    this._overlay.querySelector('#cpay-done-btn').onclick = () => {
      this._overlay.remove();
      document.body.style.overflow = '';
      o.onSuccess(receiptData);
    };
  };

  // ── EXPOSE ────────────────────────────────────────────
  global.CrescitaPay = CrescitaPay;

})(window);
