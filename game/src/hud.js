// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score,
// bomb status, kill feed, buy menu and the overlay panels. It never touches
// the simulation; main.js pushes numbers in and reads callbacks out.
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE, AMMO_PRICE } from './weapons.js';

const COPY = {
  start: {
    title: 'Emberline Tactics',
    copy: 'Round-based tactical shooting in Emberline Yard. Plant the charge at site A or B, or eliminate the Ashfall crew. Buy between rounds. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'Emberline Tactics',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  match: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud(callbacks) {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const healthNum = $('health-num');
  const healthFill = $('health-fill');
  const armorNum = $('armor-num');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const scoreValue = $('score-value');
  const roundValue = $('round-value');
  const bombBox = $('bomb-box');
  const bombLabel = $('bomb-label');
  const bombFill = $('bomb-fill');
  const feed = $('feed');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const buyMenu = $('buy-menu');
  const buyList = $('buy-list');
  const buyMoney = $('buy-money');
  const hint = $('hint');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  let hitTimer = 0;
  let bannerTimer = 0;
  let last = {};

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  function buildBuy() {
    buyList.innerHTML = '';
    const items = [
      ...WEAPONS.map((w, i) => ({ key: String(i + 1), label: w.name, price: w.price, kind: 'gun', index: i })),
      { key: '4', label: 'Ember Charge grenade', price: GRENADE_PRICE, kind: 'grenade', index: -1 },
      { key: '5', label: 'Kevlar armor', price: ARMOR_PRICE, kind: 'armor', index: -1 },
      { key: '6', label: 'Refill ammo', price: AMMO_PRICE, kind: 'ammo', index: -1 },
    ];
    for (const item of items) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'buy-row';
      row.dataset.kind = item.kind;
      row.dataset.index = String(item.index);
      row.innerHTML = `<kbd>${item.key}</kbd><span class="buy-name">${item.label}</span><span class="buy-price">$${item.price}</span>`;
      row.addEventListener('click', () => callbacks.onBuy(item));
      buyList.appendChild(row);
    }
  }
  buildBuy();

  return {
    setHealth(hp, armor) {
      setText(healthNum, 'hp', String(hp));
      setText(armorNum, 'armor', armor > 0 ? `+${armor} armor` : '');
      healthFill.style.width = `${Math.max(0, hp)}%`;
      healthFill.classList.toggle('low', hp <= 30);
    },
    setAmmo(mag, reserve, name) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'res', `/ ${reserve}`);
      setText(weaponName, 'wname', name);
      ammoMag.parentElement.classList.toggle('empty', mag === 0);
    },
    setMoney(value) {
      setText(moneyValue, 'money', `$${value}`);
      setText(buyMoney, 'buymoney', `$${value}`);
    },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      setText(timerValue, 'timer', text);
      timerValue.classList.toggle('urgent', phase === 'live' && s <= 15);
    },
    setScore(ember, ashfall, round) {
      setText(scoreValue, 'score', `${ember} — ${ashfall}`);
      setText(roundValue, 'round', `Round ${round}`);
    },
    setBomb(status) {
      if (!status) {
        bombBox.hidden = true;
        return;
      }
      bombBox.hidden = false;
      if (status.planted) {
        bombLabel.textContent = `CHARGE AT SITE ${status.site} — ${Math.ceil(status.fuse)}s`;
        bombFill.style.width = `${Math.max(0, (status.fuse / 30) * 100)}%`;
        bombFill.classList.add('fuse');
      } else {
        bombLabel.textContent = `PLANTING… ${Math.round(status.progress * 100)}%`;
        bombFill.style.width = `${status.progress * 100}%`;
        bombFill.classList.remove('fuse');
      }
    },
    setHint(text) {
      setText(hint, 'hint', text);
    },
    setCrosshair(spreadPx) {
      crosshair.style.setProperty('--gap', `${Math.round(spreadPx)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    feedLine(text) {
      const line = document.createElement('div');
      line.textContent = text;
      feed.prepend(line);
      while (feed.children.length > 4) feed.removeChild(feed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    bannerShow(titleText, subText, good, holdMs = 3600) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      banner.classList.toggle('good', good);
      banner.classList.toggle('bad', !good);
      banner.hidden = false;
      clearTimeout(bannerTimer);
      if (holdMs > 0) {
        bannerTimer = setTimeout(() => {
          banner.hidden = true;
        }, holdMs);
      }
    },
    bannerHide() {
      banner.hidden = true;
    },
    showBuy(owned, money, grenades) {
      buyMenu.hidden = false;
      setText(buyMoney, 'buymoney', `$${money}`);
      for (const row of buyList.children) {
        const kind = row.dataset.kind;
        const index = Number(row.dataset.index);
        let ownedState = false;
        if (kind === 'gun') ownedState = owned[index];
        if (kind === 'grenade') ownedState = grenades >= 2;
        row.classList.toggle('owned', ownedState);
      }
    },
    hideBuy() {
      buyMenu.hidden = true;
    },
    showOverlay(mode, score) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'match'
        ? `Final score Emberline ${score.ember} — ${score.ashfall} Ashfall. ${score.ember > score.ashfall ? 'Emberline takes the yard.' : 'Ashfall holds the yard.'}`
        : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
