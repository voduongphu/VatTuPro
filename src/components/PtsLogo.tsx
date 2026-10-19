import React from 'react';

interface PtsLogoProps {
  className?: string;
  height?: number | string;
}

/**
 * Official PTSC QUẢNG NGÃI Vector Logo
 * Faithfully matches Logo-PTSCQN-White-Border-ver-8.png
 * - Deep navy blue brand color: #1A337E
 * - Red accent flag on P: #DE2828
 * - Cyan-to-navy gradient stem on P
 * - Custom chevron 'A' without crossbar and tailored typography
 */
export const PtsLogo: React.FC<PtsLogoProps> = ({ className = 'h-11 w-auto', height }) => {
  return (
    <svg
      viewBox="0 0 540 230"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={height ? { height } : undefined}
    >
      <defs>
        {/* Cyan-to-navy gradient on lower stem of P */}
        <linearGradient id="ptscStemGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="60%" stopColor="#0284C7" />
          <stop offset="100%" stopColor="#1A337E" />
        </linearGradient>
      </defs>

      {/* =========================================
          LINE 1: PTSC
          ========================================= */}

      {/* --- LETTER P --- */}
      {/* 1. Red horizontal accent flag on the left of P */}
      <path
        d="M 80 68 H 122 L 105 88 H 80 Z"
        fill="#DE2828"
      />

      {/* 2. Lower stem of P with cyan gradient */}
      <path
        d="M 105 88 L 122 68 V 126 H 105 Z"
        fill="url(#ptscStemGrad)"
      />

      {/* 3. Navy curved bowl and upper body of P */}
      <path
        d="M 105 44 H 152 C 172 44 184 55 184 76 C 184 97 172 108 152 108 H 122 V 88 H 150 C 158 88 163 84 163 76 C 163 68 158 64 150 64 H 122 V 44 H 105 Z"
        fill="#1A337E"
      />

      {/* --- LETTER T --- */}
      <path
        d="M 194 44 H 266 V 64 H 240 V 126 H 220 V 64 H 194 Z"
        fill="#1A337E"
      />

      {/* --- LETTER S --- */}
      <path
        d="M 284 44 H 332 C 341 44 345 49 345 57 V 67 C 345 75 340 80 331 82 L 297 87 C 291 88 288 91 288 95 C 288 99 292 103 300 103 H 332 V 87 H 345 V 110 C 345 121 336 126 325 126 H 280 C 271 126 267 121 267 113 V 103 C 267 95 272 90 281 88 L 315 83 C 321 82 324 79 324 75 C 324 71 320 67 312 67 H 284 V 83 H 271 V 60 C 271 49 275 44 284 44 Z"
        fill="#1A337E"
      />

      {/* --- LETTER C --- */}
      <path
        d="M 420 44 H 375 C 358 44 348 55 348 72 V 98 C 348 115 358 126 375 126 H 420 V 104 H 378 C 371 104 368 99 368 94 V 76 C 368 71 371 66 378 66 H 420 Z"
        fill="#1A337E"
      />

      {/* =========================================
          LINE 2: QUANG NGAI
          ========================================= */}

      {/* --- LETTER Q --- */}
      <path
        d="M 40 146 C 58 146 69 158 69 176 C 69 194 58 206 40 206 C 26 206 17 198 13 187 L 27 183 C 29 189 34 192 40 192 C 49 192 54 184 54 176 C 54 168 49 160 40 160 C 31 160 26 168 26 176 C 26 181 28 185 30 188 L 18 194 C 14 189 12 183 12 176 C 12 158 23 146 40 146 Z"
        fill="#1A337E"
      />
      {/* Q tail */}
      <path
        d="M 28 200 C 30 214 43 222 47 222 C 50 222 44 214 38 205 Z"
        fill="#1A337E"
      />

      {/* --- LETTER U --- */}
      <path
        d="M 76 148 H 91 V 192 C 91 195 93 196 97 196 H 109 C 113 196 115 195 115 192 V 148 H 130 V 193 C 130 203 122 206 109 206 H 97 C 84 206 76 203 76 193 Z"
        fill="#1A337E"
      />

      {/* --- LETTER A (Chevron with NO crossbar) --- */}
      <path
        d="M 166 148 L 196 206 H 179 L 166 179 L 153 206 H 136 Z"
        fill="#1A337E"
      />

      {/* --- LETTER N --- */}
      <path
        d="M 204 148 H 220 L 240 185 V 148 H 256 V 206 H 240 L 220 169 V 206 H 204 Z"
        fill="#1A337E"
      />

      {/* --- LETTER G --- */}
      <path
        d="M 314 148 C 322 148 326 152 326 160 V 163 H 311 V 160 C 311 158 309 157 306 157 C 298 157 292 163 292 177 C 292 191 298 197 306 197 C 311 197 313 195 313 192 V 183 H 301 V 173 H 326 V 196 C 326 203 320 206 306 206 C 286 206 276 195 276 177 C 276 159 286 148 306 148 Z"
        fill="#1A337E"
      />

      {/* --- SPACE (x ~ 326 to 344) --- */}

      {/* --- LETTER N --- */}
      <path
        d="M 342 148 H 358 L 378 185 V 148 H 394 V 206 H 378 L 358 169 V 206 H 342 Z"
        fill="#1A337E"
      />

      {/* --- LETTER G --- */}
      <path
        d="M 444 148 C 452 148 456 152 456 160 V 163 H 441 V 160 C 441 158 439 157 436 157 C 428 157 422 163 422 177 C 422 191 428 197 436 197 C 441 197 443 195 443 192 V 183 H 431 V 173 H 456 V 196 C 456 203 450 206 436 206 C 416 206 406 195 406 177 C 406 159 416 148 436 148 Z"
        fill="#1A337E"
      />

      {/* --- LETTER A (Chevron with NO crossbar) --- */}
      <path
        d="M 488 148 L 518 206 H 501 L 488 179 L 475 206 H 458 Z"
        fill="#1A337E"
      />

      {/* --- LETTER I --- */}
      <path
        d="M 526 148 H 540 V 206 H 526 Z"
        fill="#1A337E"
      />
    </svg>
  );
};
