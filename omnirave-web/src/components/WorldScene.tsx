import { useEffect, useRef } from 'react';
import type { RuntimePlayer, RuntimeSession } from '../lib/session';
import { zoneDisplayName } from '../lib/zones';

const ROOM_PALETTES = {
  main_stage: {
    skyTop: '#1a1237',
    skyBottom: '#08111f',
    beamA: 'rgba(255, 57, 174, 0.34)',
    beamB: 'rgba(0, 229, 255, 0.26)',
    floor: '#140c29',
    accent: '#ff6dd0',
  },
  techno_room: {
    skyTop: '#110d18',
    skyBottom: '#03060c',
    beamA: 'rgba(90, 255, 208, 0.18)',
    beamB: 'rgba(0, 162, 255, 0.18)',
    floor: '#0a0d13',
    accent: '#63f7d2',
  },
  neon_room: {
    skyTop: '#261038',
    skyBottom: '#09101e',
    beamA: 'rgba(255, 202, 85, 0.24)',
    beamB: 'rgba(255, 76, 192, 0.22)',
    floor: '#1c1024',
    accent: '#ffd86c',
  },
} as const;

export function WorldScene(props: { session: RuntimeSession; unlocked: boolean }) {
  const { session, unlocked } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      const ratio = window.devicePixelRatio || 1;

      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      drawRoom({
        context,
        width,
        height,
        session,
        unlocked,
      });
    };

    render();

    const resizeObserver = new ResizeObserver(() => {
      render();
    });
    resizeObserver.observe(canvas);
    window.addEventListener('resize', render);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', render);
    };
  }, [session, unlocked]);

  return (
    <canvas
      ref={canvasRef}
      id="omnirave-canvas"
      className="world-scene-canvas"
      aria-label="OmniRave room view"
    />
  );
}

function drawRoom(args: {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  session: RuntimeSession;
  unlocked: boolean;
}) {
  const { context, width, height, session, unlocked } = args;
  const palette = ROOM_PALETTES[session.activeZone];
  const currentPlayers = (session.players ?? []).filter((player) => player.zone === session.activeZone);

  context.clearRect(0, 0, width, height);

  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, palette.skyTop);
  sky.addColorStop(1, palette.skyBottom);
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  drawBeams(context, width, height, palette.beamA, palette.beamB, unlocked);
  drawStage(context, width, height, palette.accent, unlocked);
  drawFloor(context, width, height, palette.floor);
  drawCrowd(context, width, height);
  drawPlayers(context, width, height, currentPlayers, session.playerId, unlocked);
  drawVenueSign(context, width, height, zoneDisplayName(session.activeZone), palette.accent);
}

function drawBeams(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  beamA: string,
  beamB: string,
  unlocked: boolean,
) {
  const intensity = unlocked ? 1 : 0.4;
  context.save();
  context.globalAlpha = intensity;

  const beam = (x: number, spread: number, color: string) => {
    context.beginPath();
    context.moveTo(x, height * 0.08);
    context.lineTo(x - spread, height * 0.72);
    context.lineTo(x + spread, height * 0.72);
    context.closePath();
    context.fillStyle = color;
    context.fill();
  };

  beam(width * 0.2, width * 0.08, beamA);
  beam(width * 0.34, width * 0.06, beamB);
  beam(width * 0.66, width * 0.06, beamB);
  beam(width * 0.8, width * 0.08, beamA);

  context.restore();
}

function drawStage(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  accent: string,
  unlocked: boolean,
) {
  const stageTop = height * 0.18;
  const stageHeight = height * 0.18;
  const stageWidth = width * 0.42;
  const stageLeft = (width - stageWidth) / 2;
  const glowAlpha = unlocked ? 0.9 : 0.45;

  context.save();
  context.fillStyle = '#04070d';
  context.fillRect(stageLeft, stageTop, stageWidth, stageHeight);

  const glow = context.createRadialGradient(width / 2, stageTop + stageHeight * 0.6, stageHeight * 0.2, width / 2, stageTop + stageHeight * 0.6, stageWidth * 0.36);
  glow.addColorStop(0, `${accent}cc`);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.globalAlpha = glowAlpha;
  context.fillStyle = glow;
  context.fillRect(stageLeft - stageWidth * 0.25, stageTop - stageHeight * 0.2, stageWidth * 1.5, stageHeight * 1.8);
  context.globalAlpha = 1;

  context.fillStyle = 'rgba(255, 255, 255, 0.08)';
  context.fillRect(stageLeft, stageTop + stageHeight * 0.12, stageWidth, 6);

  context.fillStyle = '#0f1522';
  context.fillRect(stageLeft - 22, stageTop + 18, 18, stageHeight + 28);
  context.fillRect(stageLeft + stageWidth + 4, stageTop + 18, 18, stageHeight + 28);
  context.restore();
}

function drawFloor(context: CanvasRenderingContext2D, width: number, height: number, floorColor: string) {
  context.save();
  context.beginPath();
  context.moveTo(width * 0.12, height * 0.54);
  context.lineTo(width * 0.88, height * 0.54);
  context.lineTo(width, height);
  context.lineTo(0, height);
  context.closePath();
  const floor = context.createLinearGradient(0, height * 0.54, 0, height);
  floor.addColorStop(0, 'rgba(255, 255, 255, 0.03)');
  floor.addColorStop(1, floorColor);
  context.fillStyle = floor;
  context.fill();
  context.restore();
}

function drawCrowd(context: CanvasRenderingContext2D, width: number, height: number) {
  context.save();
  context.fillStyle = 'rgba(2, 4, 8, 0.94)';

  const crowdY = height * 0.74;
  for (let index = 0; index < 18; index += 1) {
    const x = (width / 17) * index;
    const headRadius = 14 + (index % 3) * 3;
    context.beginPath();
    context.arc(x, crowdY, headRadius, 0, Math.PI * 2);
    context.fill();
    context.fillRect(x - headRadius * 1.2, crowdY + 8, headRadius * 2.4, height * 0.26);
  }

  context.restore();
}

function drawPlayers(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  players: RuntimePlayer[],
  currentPlayerId: string,
  unlocked: boolean,
) {
  if (!players.length) {
    return;
  }

  context.save();
  players.forEach((player) => {
    const point = projectPlayer(player, width, height);
    const current = player.id === currentPlayerId;
    const loadout = player.loadout ?? {};
    const bodyColor = loadoutColor(loadout.top, current);
    const hairColor = loadoutColor(loadout.hair_color, false);

    context.globalAlpha = unlocked ? 1 : 0.76;
    context.fillStyle = current ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)';
    context.beginPath();
    context.ellipse(point.x, point.y + 24, 24, 8, 0, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = bodyColor;
    context.fillRect(point.x - 12, point.y - 8, 24, 34);

    context.fillStyle = '#f1d3b0';
    context.beginPath();
    context.arc(point.x, point.y - 20, 10, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = hairColor;
    context.beginPath();
    context.arc(point.x, point.y - 24, 10, Math.PI, Math.PI * 2);
    context.fill();

    if (current) {
      context.strokeStyle = 'rgba(255,255,255,0.88)';
      context.lineWidth = 2;
      context.strokeRect(point.x - 16, point.y - 12, 32, 42);
    }

    context.fillStyle = 'rgba(8, 12, 18, 0.88)';
    context.fillRect(point.x - 42, point.y - 52, 84, 18);
    context.fillStyle = '#ffffff';
    context.font = '12px Trebuchet MS, sans-serif';
    context.textAlign = 'center';
    context.fillText(current ? 'You' : trimName(player.id), point.x, point.y - 39);
  });
  context.restore();
}

function drawVenueSign(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  stageName: string,
  accent: string,
) {
  context.save();
  context.fillStyle = 'rgba(6, 10, 16, 0.86)';
  context.fillRect(width * 0.06, height * 0.06, 220, 56);
  context.strokeStyle = 'rgba(255,255,255,0.08)';
  context.strokeRect(width * 0.06, height * 0.06, 220, 56);
  context.fillStyle = accent;
  context.font = '12px Trebuchet MS, sans-serif';
  context.fillText('OMNIRAVE', width * 0.08 + 52, height * 0.06 + 20);
  context.fillStyle = '#ffffff';
  context.font = 'bold 24px Trebuchet MS, sans-serif';
  context.fillText(stageName, width * 0.08 + 88, height * 0.06 + 44);
  context.restore();
}

function projectPlayer(player: RuntimePlayer, width: number, height: number) {
  const normalizedX = clamp((player.position.x + 48) / 96, 0.12, 0.88);
  const normalizedDepth = clamp((player.position.z + 24) / 48, 0.08, 0.92);
  return {
    x: width * normalizedX,
    y: height * (0.48 + normalizedDepth * 0.28),
  };
}

function loadoutColor(source: string | undefined, current: boolean) {
  switch (source) {
    case 'silver_jacket':
      return '#d7dfef';
    case 'neon_hoodie':
      return '#34e2ff';
    case 'vinyl_red':
      return '#ff647d';
    case 'rave_shorts':
      return '#f8d65d';
    case 'platinum':
      return '#f6f2e8';
    case 'neon_blue':
      return '#58d3ff';
    case 'black':
      return '#101420';
    default:
      return current ? '#ff84d4' : '#1d2435';
  }
}

function trimName(value: string) {
  return value.length > 12 ? `${value.slice(0, 11)}…` : value;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
