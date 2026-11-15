// Rounds: the round state machine and the economy. One match is first to 5
// round wins, at most 9 rounds. Emberline attacks: win a round by wiping
// out the Ashfall crew, or by planting the charge and letting it blow; the
// crew wins by stopping the plant, defusing it, or surviving the clock.
import { MAP } from './map.js';

const ROUND_TIME = 100;
const BUY_TIME = 15;
const PLANT_TIME = 3;
const FUSE_TIME = 30;
const WIN_SCORE = 5;
const MAX_ROUNDS = 9;
const KILL_REWARD = 300;
const WIN_REWARD = 1400;
const LOSS_REWARD = 900;
const PLANT_REWARD = 300;

export function createRounds(callbacks) {
  const state = {
    phase: 'buy', // 'buy' | 'live' | 'over' | 'match'
    round: 1,
    scoreEmber: 0,
    scoreAshfall: 0,
    money: 2400,
    timeLeft: BUY_TIME,
    bombPlanted: false,
    bombSite: null,
    fuseLeft: 0,
    plantProgress: 0,
    plantSite: null,
    winner: null,
    reason: '',
    overTimer: 0,
  };

  function inSite(x, z) {
    for (const site of MAP.sites) {
      if (Math.hypot(x - site.x, z - site.z) <= site.r) return site;
    }
    return null;
  }

  function endRound(winner, reason) {
    if (state.phase === 'over' || state.phase === 'match') return;
    state.phase = 'over';
    state.winner = winner;
    state.reason = reason;
    state.overTimer = 4;
    if (winner === 'ember') {
      state.scoreEmber += 1;
      state.money += WIN_REWARD;
    } else {
      state.scoreAshfall += 1;
      state.money += LOSS_REWARD;
    }
    callbacks.onRoundEnd(winner, reason);
  }

  function step(dt, ctx) {
    if (state.phase === 'buy') {
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) callbacks.onBuyTimeout();
      return;
    }
    if (state.phase !== 'live') {
      if (state.phase === 'over') {
        state.overTimer -= dt;
        if (state.overTimer <= 0) callbacks.onNextRound();
      }
      return;
    }
    state.timeLeft -= dt;

    // Planting: hold E inside a site for three seconds.
    if (!state.bombPlanted && ctx.playerAlive) {
      const site = inSite(ctx.playerX, ctx.playerZ);
      if (site && ctx.planting) {
        state.plantSite = site;
        state.plantProgress += dt / PLANT_TIME;
        if (state.plantProgress >= 1) {
          state.bombPlanted = true;
          state.bombSite = site;
          state.fuseLeft = FUSE_TIME;
          state.plantProgress = 0;
          state.money += PLANT_REWARD;
          callbacks.onPlant(site);
        }
      } else {
        state.plantProgress = Math.max(0, state.plantProgress - dt / PLANT_TIME);
        state.plantSite = site;
      }
    }

    if (state.bombPlanted) {
      state.fuseLeft -= dt;
      if (Math.ceil(state.fuseLeft) !== Math.ceil(state.fuseLeft + dt)) callbacks.onFuseTick(state.fuseLeft);
      if (state.fuseLeft <= 0) {
        endRound('ember', 'The charge detonated at site ' + state.bombSite.id + '.');
        return;
      }
    }

    // Elimination wins, unless the charge is already ticking: then only the
    // fuse or a defuse can end the round.
    if (!state.bombPlanted) {
      if (ctx.botsAlive === 0) {
        endRound('ember', 'Ashfall crew eliminated.');
        return;
      }
      if (!ctx.playerAlive) {
        endRound('ashfall', 'Emberline operative down.');
        return;
      }
    } else if (!ctx.playerAlive && ctx.botsAlive === 0) {
      endRound('ember', 'The charge detonated at site ' + state.bombSite.id + '.');
      return;
    }

    if (state.timeLeft <= 0) {
      endRound('ashfall', state.bombPlanted ? 'Time expired.' : 'Time expired with no plant.');
    }
  }

  return {
    state,
    step,
    awardKill() {
      state.money += KILL_REWARD;
    },
    startBuy() {
      state.phase = 'buy';
      state.timeLeft = BUY_TIME;
      state.bombPlanted = false;
      state.bombSite = null;
      state.fuseLeft = 0;
      state.plantProgress = 0;
      state.plantSite = null;
      state.winner = null;
      state.reason = '';
    },
    startRound() {
      state.phase = 'live';
      state.timeLeft = ROUND_TIME;
    },
    defused() {
      endRound('ashfall', 'The charge was defused.');
    },
    nextRound() {
      if (state.scoreEmber >= WIN_SCORE || state.scoreAshfall >= WIN_SCORE || state.round >= MAX_ROUNDS) {
        state.phase = 'match';
        callbacks.onMatchEnd(state.scoreEmber > state.scoreAshfall ? 'ember' : 'ashfall');
        return;
      }
      state.round += 1;
      this.startBuy();
      callbacks.onRoundStart();
    },
    resetMatch() {
      state.round = 1;
      state.scoreEmber = 0;
      state.scoreAshfall = 0;
      state.money = 2400;
      this.startBuy();
    },
    endRound,
  };
}
