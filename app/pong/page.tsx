'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

export default function PongGame() {
  // All hooks MUST be at top level
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseYRef = useRef(0);
  const gameStateRef = useRef({
    ballX: 400,
    ballY: 250,
    ballRadius: 25,
    ballSpeedX: 5,
    ballSpeedY: 5,
    paddle1Y: 200,
    paddle2Y: 200,
    paddleHeight: 100,
    paddleWidth: 10,
  });
  const [score1, setScore1] = useState(0);
  const [score2, setScore2] = useState(0);
  const [logoSeparated, setLogoSeparated] = useState(false);

  // Logo separation animation
  useEffect(() => {
    const timer = setTimeout(() => setLogoSeparated(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Main game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const game = gameStateRef.current;

    // Draw logo as pong ball
    const drawLogo = (x: number, y: number, radius: number) => {
      // White circle background
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Black buildings (vertical lines)
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      for (let i = -radius + 10; i < radius - 10; i += 8) {
        ctx.beginPath();
        ctx.moveTo(x + i, y - radius + 5);
        ctx.lineTo(x + i, y + radius - 5);
        ctx.stroke();
      }
    };

    const drawPaddle = (x: number, y: number) => {
      ctx.fillStyle = '#0ff';
      ctx.fillRect(x, y, game.paddleWidth, game.paddleHeight);
    };

    const drawScore = () => {
      ctx.fillStyle = '#0ff';
      ctx.font = '48px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String(score1), canvas.width / 4, 60);
      ctx.fillText(String(score2), (canvas.width * 3) / 4, 60);
    };

    const drawCenterLine = () => {
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 10]);
      ctx.beginPath();
      ctx.moveTo(canvas.width / 2, 0);
      ctx.lineTo(canvas.width / 2, canvas.height);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseYRef.current = Math.max(
        0,
        Math.min(
          canvas.height - game.paddleHeight,
          e.clientY - rect.top - game.paddleHeight / 2
        )
      );
    };

    canvas.addEventListener('mousemove', handleMouseMove);

    // Animation frame function
    const gameLoop = () => {
      // Clear canvas with black background
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw center line
      drawCenterLine();

      // Update ball position
      game.ballX += game.ballSpeedX;
      game.ballY += game.ballSpeedY;

      // Top/bottom collision
      if (game.ballY - game.ballRadius < 0 || game.ballY + game.ballRadius > canvas.height) {
        game.ballSpeedY = -game.ballSpeedY;
        game.ballY = Math.max(
          game.ballRadius,
          Math.min(canvas.height - game.ballRadius, game.ballY)
        );
      }

      // Left paddle collision
      if (
        game.ballX - game.ballRadius < game.paddleWidth &&
        game.ballY > game.paddle1Y &&
        game.ballY < game.paddle1Y + game.paddleHeight
      ) {
        game.ballSpeedX = Math.abs(game.ballSpeedX);
        game.ballX = game.paddleWidth + game.ballRadius;
      }

      // Right paddle collision
      if (
        game.ballX + game.ballRadius > canvas.width - game.paddleWidth &&
        game.ballY > game.paddle2Y &&
        game.ballY < game.paddle2Y + game.paddleHeight
      ) {
        game.ballSpeedX = -Math.abs(game.ballSpeedX);
        game.ballX = canvas.width - game.paddleWidth - game.ballRadius;
      }

      // Left side miss - player 2 scores
      if (game.ballX - game.ballRadius < 0) {
        setScore2((prev) => prev + 1);
        game.ballX = canvas.width / 2;
        game.ballY = canvas.height / 2;
        game.ballSpeedX = 5;
        game.ballSpeedY = (Math.random() - 0.5) * 6;
      }

      // Right side miss - player 1 scores
      if (game.ballX + game.ballRadius > canvas.width) {
        setScore1((prev) => prev + 1);
        game.ballX = canvas.width / 2;
        game.ballY = canvas.height / 2;
        game.ballSpeedX = -5;
        game.ballSpeedY = (Math.random() - 0.5) * 6;
      }

      // Update paddle 1 (player - mouse controlled)
      game.paddle1Y = mouseYRef.current;

      // Update paddle 2 (AI)
      const paddle2Center = game.paddle2Y + game.paddleHeight / 2;
      const aiSpeed = 3.5;
      if (paddle2Center < game.ballY - 30) {
        game.paddle2Y += aiSpeed;
      } else if (paddle2Center > game.ballY + 30) {
        game.paddle2Y -= aiSpeed;
      }
      game.paddle2Y = Math.max(
        0,
        Math.min(canvas.height - game.paddleHeight, game.paddle2Y)
      );

      // Draw everything
      drawPaddle(0, game.paddle1Y);
      drawPaddle(canvas.width - game.paddleWidth, game.paddle2Y);
      drawLogo(game.ballX, game.ballY, game.ballRadius);
      drawScore();

      requestAnimationFrame(gameLoop);
    };

    const animationId = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animationId);
      canvas.removeEventListener('mousemove', handleMouseMove);
    };
  }, [score1, score2]);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center relative overflow-hidden">
      {/* Animated logo separation - lines fly to sides */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Left line from logo */}
        <div
          className="absolute top-1/2 left-0 h-20 w-1 bg-white transform transition-all duration-1000"
          style={{
            marginTop: '-40px',
            ...(logoSeparated
              ? { transform: 'translateX(-120px)', opacity: 0.4 }
              : { transform: 'translateX(0)', opacity: 1 }),
          }}
        />
        {/* Right line from logo */}
        <div
          className="absolute top-1/2 right-0 h-20 w-1 bg-white transform transition-all duration-1000"
          style={{
            marginTop: '-40px',
            ...(logoSeparated
              ? { transform: 'translateX(120px)', opacity: 0.4 }
              : { transform: 'translateX(0)', opacity: 1 }),
          }}
        />
      </div>

      {/* Title */}
      <div className="absolute top-8 left-0 right-0 text-center pointer-events-none z-10">
        <h1
          className="text-4xl font-black text-cyan-400 tracking-widest"
          style={{ fontFamily: '"Press Start 2P", monospace', textShadow: '0 0 10px #00ffff' }}
        >
          PONG GAME
        </h1>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={800}
        height={500}
        className="border-4 border-cyan-400 shadow-2xl"
        style={{
          boxShadow: '0 0 20px rgba(0, 255, 255, 0.8), inset 0 0 20px rgba(0, 255, 255, 0.1)',
        }}
      />

      {/* Instructions */}
      <div
        className="absolute bottom-24 left-1/2 transform -translate-x-1/2 text-center text-cyan-400 text-xs"
        style={{ fontFamily: '"Press Start 2P", monospace' }}
      >
        Move mouse to control left paddle
      </div>

      {/* Back button */}
      <Link
        href="/tenant"
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2 px-6 py-3 bg-cyan-400 text-black font-bold text-sm hover:bg-cyan-300 transition-colors"
        style={{ fontFamily: '"Press Start 2P", monospace', fontSize: '12px' }}
      >
        BACK
      </Link>

      {/* Font import & animations */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
      `}</style>
    </div>
  );
}
