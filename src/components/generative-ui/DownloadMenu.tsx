'use client';

import React, { useState, useRef, useEffect } from 'react';
import { toCsv, downloadCsv, downloadXlsx, CsvRow } from '@/src/lib/csv';

interface DownloadMenuProps {
  data: CsvRow[];
  filename: string; // Without extension
  columns?: string[];
}

export function DownloadMenu({ data, filename, columns }: DownloadMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close menu on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  const handleDownloadCsv = () => {
    const csvText = toCsv(data, columns);
    downloadCsv(`${filename}.csv`, csvText);
    setIsOpen(false);
  };

  const handleDownloadXlsx = () => {
    downloadXlsx(`${filename}.xlsx`, data, columns);
    setIsOpen(false);
  };

  if (data.length === 0) return null;

  return (
    <div ref={menuRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Download Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'transparent',
          border: '1px solid #333',
          borderRadius: '6px',
          padding: '6px 10px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          color: '#888',
          fontSize: '12px',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#00ff88';
          e.currentTarget.style.color = '#00ff88';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#333';
          e.currentTarget.style.color = '#888';
        }}
        title="Download data"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '4px',
            background: '#0f0f0f',
            border: '1px solid #2a2a2a',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            overflow: 'hidden',
            zIndex: 100,
            minWidth: '140px',
          }}
        >
          <button
            onClick={handleDownloadCsv}
            style={{
              width: '100%',
              padding: '10px 14px',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid #1a1a1a',
              color: '#ccc',
              fontSize: '13px',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#1a1a1a';
              e.currentTarget.style.color = '#00ff88';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#ccc';
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <span>CSV</span>
            <span style={{ marginLeft: 'auto', color: '#666', fontSize: '11px' }}>.csv</span>
          </button>
          <button
            onClick={handleDownloadXlsx}
            style={{
              width: '100%',
              padding: '10px 14px',
              background: 'transparent',
              border: 'none',
              color: '#ccc',
              fontSize: '13px',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#1a1a1a';
              e.currentTarget.style.color = '#00d4ff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#ccc';
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <rect x="8" y="12" width="8" height="6" rx="1" />
            </svg>
            <span>Excel</span>
            <span style={{ marginLeft: 'auto', color: '#666', fontSize: '11px' }}>.xlsx</span>
          </button>
        </div>
      )}
    </div>
  );
}
