'use client'

import React from 'react'
import type { MockupDeviceType, MockupVariant } from '@/types/presentation'

interface DeviceMockupProps {
  deviceType: MockupDeviceType
  deviceVariant?: MockupVariant
  deviceColor?: string
  children: React.ReactNode
  width: number
  height: number
}

export default function DeviceMockup({
  deviceType,
  deviceVariant = 'front',
  deviceColor = '#1a1a2e',
  children,
  width,
  height,
}: DeviceMockupProps) {
  switch (deviceType) {
    case 'iphone':
      return <IPhoneMockup variant={deviceVariant} color={deviceColor} width={width} height={height}>{children}</IPhoneMockup>
    case 'ipad':
      return <IPadMockup variant={deviceVariant} color={deviceColor} width={width} height={height}>{children}</IPadMockup>
    case 'macbook':
      return <MacbookMockup variant={deviceVariant} color={deviceColor} width={width} height={height}>{children}</MacbookMockup>
    case 'browser':
      return <BrowserMockup variant={deviceVariant} width={width} height={height}>{children}</BrowserMockup>
    case 'tv':
      return <TvMockup variant={deviceVariant} color={deviceColor} width={width} height={height}>{children}</TvMockup>
    case 'phone-generic':
      return <PhoneGenericMockup variant={deviceVariant} color={deviceColor} width={width} height={height}>{children}</PhoneGenericMockup>
    default:
      return <>{children}</>
  }
}

// ─── iPhone ──────────────────────────────────────────

function IPhoneMockup({ variant, color, width, height, children }: {
  variant: MockupVariant; color: string; width: number; height: number; children: React.ReactNode
}) {
  const frameColor = color === 'white' ? '#f5f5f7' : color === 'silver' ? '#e0e0e0' : '#1d1d1f'
  const borderColor = color === 'white' ? '#d1d1d6' : color === 'silver' ? '#c0c0c0' : '#333'
  const transform = variant === 'tilted' ? 'perspective(1200px) rotateY(-15deg) rotateX(5deg)'
    : variant === 'side' ? 'perspective(1200px) rotateY(-30deg)'
    : undefined

  // iPhone proportions: screen is ~88% of frame
  const frameW = width
  const frameH = height
  const screenPadX = frameW * 0.04
  const screenPadTop = frameH * 0.06
  const screenPadBot = frameH * 0.06

  return (
    <div style={{ width: frameW, height: frameH, transform, transformStyle: 'preserve-3d' }}>
      <div style={{
        width: '100%', height: '100%',
        background: frameColor,
        borderRadius: frameW * 0.12,
        border: `3px solid ${borderColor}`,
        padding: `${screenPadTop}px ${screenPadX}px ${screenPadBot}px`,
        boxShadow: '0 20px 60px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.05)',
        display: 'flex', flexDirection: 'column',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Notch */}
        <div style={{
          position: 'absolute', top: screenPadTop * 0.3, left: '50%', transform: 'translateX(-50%)',
          width: frameW * 0.35, height: screenPadTop * 0.5,
          background: frameColor, borderRadius: '0 0 16px 16px', zIndex: 2,
        }} />
        {/* Screen */}
        <div style={{
          flex: 1, borderRadius: frameW * 0.06, overflow: 'hidden', background: '#000',
        }}>
          {children}
        </div>
        {/* Home indicator */}
        <div style={{
          width: frameW * 0.35, height: 4, background: borderColor,
          borderRadius: 2, margin: '8px auto 0', opacity: 0.5,
        }} />
      </div>
    </div>
  )
}

// ─── iPad ────────────────────────────────────────────

function IPadMockup({ variant, color, width, height, children }: {
  variant: MockupVariant; color: string; width: number; height: number; children: React.ReactNode
}) {
  const frameColor = color === 'white' ? '#f5f5f7' : color === 'silver' ? '#e0e0e0' : '#1d1d1f'
  const borderColor = color === 'white' ? '#d1d1d6' : color === 'silver' ? '#c0c0c0' : '#333'
  const transform = variant === 'tilted' ? 'perspective(1200px) rotateY(-10deg) rotateX(5deg)' : undefined
  const pad = width * 0.03

  return (
    <div style={{ width, height, transform, transformStyle: 'preserve-3d' }}>
      <div style={{
        width: '100%', height: '100%',
        background: frameColor,
        borderRadius: width * 0.04,
        border: `3px solid ${borderColor}`,
        padding: pad,
        boxShadow: '0 15px 50px rgba(0,0,0,0.35)',
        display: 'flex',
      }}>
        <div style={{ flex: 1, borderRadius: width * 0.015, overflow: 'hidden', background: '#000' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

// ─── MacBook ─────────────────────────────────────────

function MacbookMockup({ variant, color, width, height, children }: {
  variant: MockupVariant; color: string; width: number; height: number; children: React.ReactNode
}) {
  const frameColor = color === 'white' ? '#f5f5f7' : color === 'silver' ? '#e8e8ed' : '#2d2d2f'
  const baseColor = color === 'white' ? '#e8e8ed' : color === 'silver' ? '#d1d1d6' : '#1d1d1f'
  const transform = variant === 'tilted' ? 'perspective(1500px) rotateX(5deg)' : variant === 'flat' ? 'perspective(2000px) rotateX(15deg)' : undefined

  const screenH = height * 0.82
  const baseH = height * 0.18
  const bezelPad = width * 0.025

  return (
    <div style={{ width, height, transform, transformStyle: 'preserve-3d' }}>
      {/* Screen */}
      <div style={{
        width: '100%', height: screenH,
        background: frameColor,
        borderRadius: `${width * 0.02}px ${width * 0.02}px 0 0`,
        border: `2px solid ${frameColor}`,
        padding: `${bezelPad}px ${bezelPad}px ${bezelPad * 0.5}px`,
        boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
      }}>
        {/* Camera dot */}
        <div style={{
          width: 6, height: 6, borderRadius: '50%', background: '#444',
          margin: '0 auto 4px',
        }} />
        <div style={{ width: '100%', height: `calc(100% - 10px)`, borderRadius: 4, overflow: 'hidden', background: '#000' }}>
          {children}
        </div>
      </div>
      {/* Base */}
      <div style={{
        width: '110%', height: baseH, marginLeft: '-5%',
        background: `linear-gradient(180deg, ${baseColor} 0%, ${frameColor} 100%)`,
        borderRadius: `0 0 ${width * 0.015}px ${width * 0.015}px`,
        boxShadow: '0 5px 20px rgba(0,0,0,0.2)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: 3,
      }}>
        {/* Trackpad indent */}
        <div style={{
          width: width * 0.25, height: baseH * 0.06,
          background: 'rgba(0,0,0,0.08)', borderRadius: 2,
        }} />
      </div>
    </div>
  )
}

// ─── Browser ─────────────────────────────────────────

function BrowserMockup({ variant, width, height, children }: {
  variant: MockupVariant; width: number; height: number; children: React.ReactNode
}) {
  const barH = Math.max(28, height * 0.06)
  const isDark = variant !== 'side' // 'side' = light browser

  return (
    <div style={{
      width, height,
      borderRadius: 10,
      overflow: 'hidden',
      boxShadow: '0 15px 50px rgba(0,0,0,0.35)',
      border: `1px solid ${isDark ? '#333' : '#ddd'}`,
    }}>
      {/* Title bar */}
      <div style={{
        height: barH,
        background: isDark ? '#2a2a2e' : '#f0f0f0',
        display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6,
        borderBottom: `1px solid ${isDark ? '#444' : '#ddd'}`,
      }}>
        <div style={{ display: 'flex', gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
        </div>
        <div style={{
          flex: 1, height: barH * 0.55, marginLeft: 8,
          background: isDark ? '#1a1a1e' : '#fff',
          borderRadius: 5, border: `1px solid ${isDark ? '#444' : '#ccc'}`,
        }} />
      </div>
      {/* Content */}
      <div style={{ width: '100%', height: `calc(100% - ${barH}px)`, background: '#000' }}>
        {children}
      </div>
    </div>
  )
}

// ─── TV ──────────────────────────────────────────────

function TvMockup({ variant, color, width, height, children }: {
  variant: MockupVariant; color: string; width: number; height: number; children: React.ReactNode
}) {
  const frameColor = color === 'white' ? '#e8e8ed' : '#1d1d1f'
  const transform = variant === 'tilted' ? 'perspective(1500px) rotateY(-8deg)' : undefined
  const bezel = width * 0.015
  const screenH = height * 0.85
  const standH = height * 0.15

  return (
    <div style={{ width, height, transform, transformStyle: 'preserve-3d' }}>
      <div style={{
        width: '100%', height: screenH,
        background: frameColor,
        borderRadius: 6,
        border: `2px solid ${frameColor}`,
        padding: bezel,
        boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
      }}>
        <div style={{ width: '100%', height: '100%', borderRadius: 2, overflow: 'hidden', background: '#000' }}>
          {children}
        </div>
      </div>
      {/* Stand */}
      <div style={{
        width: width * 0.3, height: standH * 0.6,
        background: frameColor, margin: '0 auto',
        clipPath: 'polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)',
      }} />
      <div style={{
        width: width * 0.4, height: standH * 0.15,
        background: frameColor, borderRadius: 4,
        margin: '0 auto',
      }} />
    </div>
  )
}

// ─── Generic Phone ───────────────────────────────────

function PhoneGenericMockup({ variant, color, width, height, children }: {
  variant: MockupVariant; color: string; width: number; height: number; children: React.ReactNode
}) {
  const frameColor = color === 'white' ? '#f5f5f7' : '#1d1d1f'
  const borderColor = color === 'white' ? '#d1d1d6' : '#333'
  const transform = variant === 'tilted' ? 'perspective(1200px) rotateY(-15deg) rotateX(5deg)' : undefined
  const pad = width * 0.04
  const topPad = height * 0.04
  const botPad = height * 0.04

  return (
    <div style={{ width, height, transform, transformStyle: 'preserve-3d' }}>
      <div style={{
        width: '100%', height: '100%',
        background: frameColor,
        borderRadius: width * 0.08,
        border: `3px solid ${borderColor}`,
        padding: `${topPad}px ${pad}px ${botPad}px`,
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        <div style={{ width: '100%', height: '100%', borderRadius: width * 0.04, overflow: 'hidden', background: '#000' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
