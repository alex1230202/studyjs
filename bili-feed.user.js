// ==UserScript==
// @name        B站竖版学习刷看器 (bili-feed)
// @namespace   dsh.bili-feed
// @version     0.4.0
// @description 在 B 站（桌面浏览器 + 手机 Kiwi 浏览器）页面按 Alt+S 唤出全屏滑动浏览播放器。按配置搜索词自动拉取 B 站视频，官方播放器内嵌，上滑/下滑切换，不刷到无关内容。同一脚本两端通用。
// @author      DeepSeek Harness
// @match       https://www.bilibili.com/*
// @match       https://bilibili.com/*
// @match       https://m.bilibili.com/*
// @match       https://search.bilibili.com/*
// @grant       GM_xmlhttpRequest
// @grant       GM_addStyle
// @grant       GM_getValue
// @grant       GM_setValue
// @run-at      document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   *  配置（按 Alt+S 打开后可进设置修改，或直接改这里）                     *
   * ------------------------------------------------------------------ */
  const DEFAULT_CFG = {
    enabled: true,
    keyword: '高中数学',        // 默认搜索词（学习主题）
    pageSize: 12,               // 每页拉取条数
    blockKeywords: [],          // 黑名单：标题命中则跳过
  };
  const cfg = Object.assign({}, DEFAULT_CFG, GM_getValue('bili-feed.cfg', {}));
  const saveCfg = () => GM_setValue('bili-feed.cfg', cfg);

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  /* ------------------------------------------------------------------ *
   *  状态                                                                *
   * ------------------------------------------------------------------ */
  let feed = [];       // 已载入的视频项 {bvid,title,pic,url,author}
  let cursor = 0;      // 当前播放索引
  let pageNo = 1;      // 已拉取搜索页数
  let loading = false;
  let root = null;
  let bar = null, tip = null, titleEl = null;

  function setLoading(on) { if (bar) bar.classList.toggle('bf-show', on); }
  function toast(msg) {
    if (!tip) { tip = document.createElement('div'); tip.className = 'bf-tip'; document.body.appendChild(tip); }
    tip.textContent = msg; tip.classList.add('bf-show');
    clearTimeout(tip._t); tip._t = setTimeout(() => tip.classList.remove('bf-show'), 2800);
  }

  /* ------------------------------------------------------------------ *
   *  内容加载（手机端已验证可用）：                                       *
   * ------------------------------------------------------------------ */
  //   api.bilibili.com/x/web-interface/wbi/search/type
  //   实测：手机UA、桌面UA、任意 Referer 组合均返回 code:0 与完整列表。
  //   因此不强制改写 User-Agent（部分浏览器/油猴版本不允许改 UA 头，写了反而报错），
  //   只设 Referer/Origin，两端通用最稳。
  function searchApi(keyword, page) {
    return new Promise((resolve, reject) => {
      const url = 'https://api.bilibili.com/x/web-interface/wbi/search/type' +
        '?search_type=video&keyword=' + encodeURIComponent(keyword) +
        '&page=' + page + '&page_size=' + cfg.pageSize;
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers: {
          'Referer': 'https://www.bilibili.com/',
          'Origin': 'https://www.bilibili.com',
        },
        timeout: 25000,
        onload(res) {
          try {
            const j = JSON.parse(res.responseText);
            if (j.code !== 0) return reject(new Error('code=' + j.code + (j.message ? ' ' + j.message : '')));
            const list = (j.data && j.data.result) || [];
            const items = [];
            for (const it of list) {
              const bvid = it.bvid || '';
              const title = String(it.title || '').replace(/<[^>]+>/g, '').trim();
              if (!bvid || !title) continue;                 // 广告项无 BV，跳过
              if (cfg.blockKeywords.some(k => k && title.toLowerCase().includes(k.toLowerCase()))) continue;
              items.push({
                bvid,
                title,
                url: 'https://www.bilibili.com/video/' + bvid,
                pic: (it.pic || '').replace(/^\/\//, 'https://'),
                author: it.author || '',
                duration: it.duration || '',
              });
            }
            resolve(items);
          } catch (e) { reject(e); }
        },
        onerror: reject,
        ontimeout() { reject(new Error('搜索超时')); },
      });
    });
  }

  async function loadMore() {
    if (loading) return;
    if (!cfg.enabled) return toast('已停用');
    loading = true;
    setLoading(true);
    try {
      const added = await searchApi(cfg.keyword, pageNo);
      if (!added.length) toast('没有更多结果，或内容都被过滤了');
      feed = feed.concat(added);
      pageNo += 1;
      if (cursor === 0 && feed.length) render();
    } catch (e) {
      toast('加载失败：' + e.message + '（检查网络或改用桌面浏览器）');
    } finally {
      loading = false;
      setLoading(false);
    }
  }

  /* ------------------------------------------------------------------ *
   *  渲染：官方播放器 iframe 内嵌                                        *
   *  使用 player.bilibili.com/player.html?bvid= 可靠内嵌播放（不触发风控） *
   * ------------------------------------------------------------------ */
  function render() {
    if (!root) return;
    const it = feed[cursor];
    if (!it) return;
    $$('.bf-stage', root).forEach(n => n.remove());
    const stage = document.createElement('div');
    stage.className = 'bf-stage';

    // 右上角标签：当前第几条 / 总数
    const badge = document.createElement('div');
    badge.className = 'bf-badge';
    badge.textContent = (cursor + 1) + ' / ' + feed.length;
    stage.appendChild(badge);

    const titlebar = document.createElement('div');
    titlebar.className = 'bf-slidetitle';
    titlebar.textContent = it.title;
    stage.appendChild(titlebar);

    const frame = document.createElement('iframe');
    frame.className = 'bf-frame';
    frame.src = 'https://player.bilibili.com/player.html?bvid=' + it.bvid + '&autoplay=1&high_quality=1&danmaku=1';
    frame.allowFullscreen = true;
    frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
    frame.scrolling = 'no';
    frame.setAttribute('frameborder', '0');
    stage.appendChild(frame);

    // 点击舞台文字/空白不误伤 iframe 交互
    root.appendChild(stage);

    if (titleEl) titleEl.textContent = it.title;
  }

  /* ------------------------------------------------------------------ *
   *  操作                                                                *
   * ------------------------------------------------------------------ */
  let busy = false;
  function step(n) {
    if (!feed.length || busy) return;
    busy = true;
    const nc = clamp(cursor + n, 0, feed.length - 1);
    // 接近末尾预加载下一页
    if (nc >= feed.length - 2) loadMore();
    if (nc !== cursor) { cursor = nc; render(); }
    setTimeout(() => { busy = false; }, 280);
  }

  function wireGestures() {
    // 触摸手势（手机）：在左右两侧各放一条透明滑动带，竖向滑动切换视频。
    // 中央区域保留给官方播放器交互（进度/暂停/全屏）。
    ['left', 'right'].forEach(side => {
      const zone = document.createElement('div');
      zone.className = 'bf-swipe bf-swipe-' + side;
      let startY = null;
      zone.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
      }, { passive: true });
      zone.addEventListener('touchend', (e) => {
        if (startY === null) return;
        const dy = (e.changedTouches[0].clientY) - startY;
        startY = null;
        if (dy < -55) step(1);
        else if (dy > 55) step(-1);
      }, { passive: true });
      root.appendChild(zone);
    });

    // 桌面指针手势（无 iframe 覆盖到就任区域）
    let pStart = null;
    root.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' && e.target.closest('.bf-btn, iframe, a, .bf-swipe')) return;
      if (e.pointerType === 'touch') return;
      pStart = e.clientY;
    });
    root.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch' || pStart === null) return;
      const dy = e.clientY - pStart;
      pStart = null;
      if (dy < -70) step(1);
      else if (dy > 70) step(-1);
    });
  }

  function onKey(e) {
    if (!root) return;
    if (e.key === 'Escape') { close(); return; }
    const tag = (document.activeElement || {}).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'IFRAME') return;
    if (e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (e.key === 's' || e.key === 'S') toggle();
  }

  /* ------------------------------------------------------------------ *
   *  UI 构建                                                           *
   * ------------------------------------------------------------------ */
  function buildUI() {
    root = document.createElement('div');
    root.id = 'bf-root';

    const top = document.createElement('div');
    top.className = 'bf-top';
    const tag = document.createElement('span');
    tag.className = 'bf-tag'; tag.textContent = '学习';
    const title = document.createElement('div');
    title.className = 'bf-cursor';
    title.textContent = '';
    titleEl = title;
    const l = document.createElement('div'); l.className = 'bf-slot'; l.appendChild(tag); l.appendChild(title);
    top.appendChild(l);

    const rset = document.createElement('button'); rset.className = 'bf-btn'; rset.textContent = '⚙ 设置';
    rset.addEventListener('click', openSettings);
    const rclose = document.createElement('button'); rclose.className = 'bf-btn bf-close'; rclose.textContent = '✕ 退出';
    rclose.addEventListener('click', close);
    const r = document.createElement('div'); r.className = 'bf-slot'; r.appendChild(rset); r.appendChild(rclose);
    top.appendChild(r);
    root.appendChild(top);

    bar = document.createElement('div'); bar.className = 'bf-bar';
    bar.textContent = '正在加载内容…';
    root.appendChild(bar);

    const bottom = document.createElement('div');
    bottom.className = 'bf-bottom';
    const prev = document.createElement('button'); prev.className = 'bf-nav'; prev.textContent = '↑ 上一个';
    prev.addEventListener('click', () => step(-1));
    const nxt = document.createElement('button'); nxt.className = 'bf-nav bf-next'; nxt.textContent = '↓ 下一个';
    nxt.addEventListener('click', () => step(1));
    bottom.appendChild(prev); bottom.appendChild(nxt);
    root.appendChild(bottom);

    document.body.appendChild(root);
  }

  function open() {
    if (root) return;
    buildUI();
    wireGestures();
    document.addEventListener('keydown', onKey);
    loadMore();
  }
  function close() {
    if (!root) return;
    $$('iframe', root).forEach(f => { f.src = 'about:blank'; });
    root.remove(); root = null; bar = null; tip = null; titleEl = null;
    document.removeEventListener('keydown', onKey);
  }
  function toggle() { root ? close() : open(); }

  /* ------------------------------------------------------------------ *
   *  设置面板                                                            *
   * ------------------------------------------------------------------ */
  function openSettings() {
    const panel = document.createElement('div');
    panel.className = 'bf-panel';
    const h = document.createElement('h2'); h.textContent = '浏览设置'; panel.appendChild(h);
    const row = (label, val) => {
      const wrap = document.createElement('label'); wrap.className = 'bf-panel-row';
      const sp = document.createElement('span'); sp.textContent = label;
      const inp = document.createElement('input'); inp.value = val;
      wrap.appendChild(sp); wrap.appendChild(inp); panel.appendChild(wrap);
      return inp;
    };
    const kw = row('搜索词', cfg.keyword);
    const bl = row('屏蔽词（逗号分隔）', cfg.blockKeywords.join(','));
    const pn = row('每页条数', cfg.pageSize);

    const foot = document.createElement('div'); foot.className = 'bf-panel-foot';
    const ok = document.createElement('button'); ok.className = 'bf-btn bf-primary'; ok.textContent = '保存并重新加载';
    ok.addEventListener('click', () => {
      cfg.keyword = kw.value.trim() || DEFAULT_CFG.keyword;
      cfg.blockKeywords = bl.value.split(',').map(s => s.trim()).filter(Boolean);
      cfg.pageSize = clamp(parseInt(pn.value, 10) || DEFAULT_CFG.pageSize, 1, 30);
      saveCfg();
      feed = []; cursor = 0; pageNo = 1;
      panel.remove(); setLoading(false);
      render(); loadMore();
    });
    const cancel = document.createElement('button'); cancel.className = 'bf-btn'; cancel.textContent = '取消';
    cancel.addEventListener('click', () => panel.remove());
    foot.appendChild(cancel); foot.appendChild(ok);
    panel.appendChild(foot);
    root.appendChild(panel);
  }

  /* ------------------------------------------------------------------ *
   *  样式                                                                *
   * ------------------------------------------------------------------ */
  GM_addStyle(`
    #bf-root{position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;background:#000;color:#fff;
      font-family:system-ui,-apple-system,"PingFang SC",sans-serif;overflow:hidden;touch-action:none;user-select:none}
    #bf-root *{box-sizing:border-box}
    .bf-stage{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#000}
    .bf-frame{position:absolute;inset:0;width:100%;height:100%;border:0;background:#000}
    .bf-slidetitle{position:absolute;top:76px;left:16px;right:16px;z-index:4;font-size:16px;line-height:1.4;
      color:#fff;text-shadow:0 1px 8px rgba(0,0,0,.9);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .bf-badge{position:absolute;top:76px;right:16px;z-index:4;background:rgba(0,0,0,.55);color:#fff;border-radius:10px;
      padding:2px 10px;font-size:12px;font-weight:600}
    .bf-top{position:absolute;top:0;left:0;right:0;z-index:5;display:flex;justify-content:space-between;align-items:center;
      padding:12px 14px;background:linear-gradient(rgba(0,0,0,.7),transparent)}
    .bf-slot{display:flex;align-items:center;gap:10px}
    .bf-tag{background:#fb7299;color:#fff;border-radius:10px;padding:2px 10px;font-size:13px;font-weight:600}
    .bf-cursor{font-size:13px;opacity:.85}
    .bf-btn{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25);color:#fff;border-radius:8px;
      padding:6px 12px;font-size:13px;cursor:pointer}
    .bf-btn:hover{background:rgba(255,255,255,.26)}
    .bf-close{border-color:#fb7299;color:#ffb3c6}
    .bf-bar{position:absolute;top:64px;left:50%;transform:translateX(-50%);z-index:6;opacity:0;transition:.25s;
      background:rgba(0,0,0,.75);padding:6px 14px;border-radius:16px;font-size:13px;color:#9be3c8;pointer-events:none}
    .bf-bar.bf-show{opacity:1}
    .bf-bottom{position:absolute;bottom:0;left:0;right:0;z-index:5;display:flex;justify-content:center;gap:18px;
      padding:16px;background:linear-gradient(transparent,rgba(0,0,0,.7))}
    .bf-nav{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);color:#fff;border-radius:22px;
      padding:9px 18px;font-size:14px;cursor:pointer}
    .bf-tip{position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:2147483647;background:rgba(0,0,0,.84);
      color:#fff;padding:9px 16px;border-radius:10px;font-size:13px;opacity:0;transition:.2s;pointer-events:none;max-width:80vw}
    .bf-tip.bf-show{opacity:1}
    .bf-panel{position:absolute;z-index:10;top:50%;left:50%;transform:translate(-50%,-50%);width:min(420px,88vw);
      background:#1e1e22;border:1px solid #333;border-radius:14px;padding:18px}
    .bf-panel h2{margin:0 0 14px;font-size:17px}
    .bf-panel-row{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;font-size:13px;color:#ccc}
    .bf-panel-row input{background:#111;border:1px solid #333;color:#fff;border-radius:8px;padding:8px 10px;font-size:13px}
    .bf-panel-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}
    .bf-primary{background:#fb7299;border:none;font-weight:600}

    /* 手机滑动区：左右两侧透明竖条，竖向滑动切换视频（中央留给播放器） */
    .bf-swipe{position:absolute;top:0;bottom:0;width:14%;z-index:3;background:transparent;touch-action:none}
    .bf-swipe-left{left:0}
    .bf-swipe-right{right:0}

    /* 手机端触屏优化 */
    @media (pointer: coarse), (max-width: 860px) {
      .bf-nav{padding:14px 24px;font-size:16px;min-height:52px}
      .bf-btn{padding:10px 14px;font-size:14px}
      .bf-tag{padding:4px 12px}
      .bf-slidetitle{top:88px;font-size:18px;padding:0 4px}
      .bf-badge{top:88px;font-size:14px}
      #bf-root{padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom) 0}
      .bf-bottom{padding-bottom:calc(16px + env(safe-area-inset-bottom))}
      .bf-top{padding-top:calc(12px + env(safe-area-inset-top))}
      .bf-panel{max-height:80vh;overflow:auto}
    }
  `);

  /* 全局快捷键 Alt+S */
  document.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); toggle(); }
  });

  console.log('[bili-feed] 已加载。按 Alt+S 唤出全屏滑动学习浏览播放器。');
})();