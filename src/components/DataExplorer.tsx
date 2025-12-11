'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, Table, Download, ChevronLeft, ChevronRight, Clock, ToggleLeft, ToggleRight, Loader2, Search, Terminal, Zap } from 'lucide-react';

interface TableInfo {
  name: string;
  displayName: string;
  dateColumns: string[];
}

interface TableData {
  table: string;
  displayName: string;
  dateColumns: string[];
  columns: string[];
  data: Record<string, unknown>[];
  totalCount: number;
  limit: number;
  offset: number;
}

// Retro-futuristic color palette
const colors = {
  bg: '#0a0a0c',
  bgPanel: '#0f1014',
  bgCard: '#14161a',
  bgHover: '#1a1d22',
  border: '#2a2d35',
  borderActive: '#00ff88',
  text: '#e8e8e8',
  textMuted: '#6b7280',
  textDim: '#4a4f5a',
  accent: '#00ff88',
  accentDim: '#00cc6a',
  accentGlow: 'rgba(0, 255, 136, 0.15)',
  warning: '#ffc107',
  error: '#ff4444',
  cyan: '#00d4ff',
  purple: '#a855f7',
};

const DataExplorer: React.FC = () => {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(false);
  const [applyDateOffset, setApplyDateOffset] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [bootSequence, setBootSequence] = useState(true);
  const pageSize = 50;

  // Boot sequence animation
  useEffect(() => {
    const timer = setTimeout(() => setBootSequence(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  // Fetch available tables
  useEffect(() => {
    fetch('/api/data-explorer')
      .then(res => res.json())
      .then(data => setTables(data.tables || []))
      .catch(console.error);
  }, []);

  // Fetch table data
  const fetchTableData = useCallback(async (tableName: string, page: number = 0) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/data-explorer?table=${tableName}&applyOffset=${applyDateOffset}&limit=${pageSize}&offset=${page * pageSize}`
      );
      const data = await res.json();
      setTableData(data);
    } catch (error) {
      console.error('Failed to fetch table data:', error);
    } finally {
      setLoading(false);
    }
  }, [applyDateOffset]);

  // Handle table selection
  const handleSelectTable = (tableName: string) => {
    setSelectedTable(tableName);
    setCurrentPage(0);
    setSearchQuery('');
    fetchTableData(tableName, 0);
  };

  // Handle pagination
  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    if (selectedTable) {
      fetchTableData(selectedTable, newPage);
    }
  };

  // Handle date offset toggle
  useEffect(() => {
    if (selectedTable) {
      fetchTableData(selectedTable, currentPage);
    }
  }, [applyDateOffset, selectedTable, currentPage, fetchTableData]);

  // Export to CSV
  const exportCSV = () => {
    if (!tableData || !tableData.data.length) return;

    const headers = tableData.columns.join(',');
    const rows = tableData.data.map(row =>
      tableData.columns.map(col => {
        const val = row[col];
        if (val === null || val === undefined) return '';
        if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return String(val);
      }).join(',')
    );

    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${tableData.table}_${applyDateOffset ? 'adjusted' : 'raw'}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Filter data by search query
  const filteredData = tableData?.data.filter(row => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return Object.values(row).some(val =>
      String(val).toLowerCase().includes(query)
    );
  }) || [];

  const totalPages = tableData ? Math.ceil(tableData.totalCount / pageSize) : 0;

  // Format cell value for display
  const formatCellValue = (value: unknown, column: string): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object') return JSON.stringify(value);

    // Format dates nicely
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        if (value.includes('T')) {
          return date.toLocaleString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
          });
        }
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
    }

    // Format numbers
    if (typeof value === 'number') {
      if (column.toLowerCase().includes('amount') || column.toLowerCase().includes('price') ||
          column.toLowerCase().includes('balance') || column.toLowerCase().includes('premium') ||
          column.toLowerCase().includes('commission') || column.toLowerCase().includes('fee')) {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
      }
      return value.toLocaleString();
    }

    return String(value);
  };

  // Check if column is a date column
  const isDateColumn = (column: string): boolean => {
    return tableData?.dateColumns.includes(column) || false;
  };

  // Boot sequence screen
  if (bootSequence) {
    return (
      <div style={{
        minHeight: '100vh',
        background: colors.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      }}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ textAlign: 'center' }}
        >
          <motion.div
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            style={{
              fontSize: '14px',
              color: colors.accent,
              letterSpacing: '4px',
              marginBottom: '20px',
            }}
          >
            INITIALIZING DATA TERMINAL
          </motion.div>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: 200 }}
            transition={{ duration: 1.5, ease: 'linear' }}
            style={{
              height: '2px',
              background: `linear-gradient(90deg, ${colors.accent}, ${colors.cyan})`,
              boxShadow: `0 0 10px ${colors.accent}`,
            }}
          />
        </motion.div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: colors.bg,
      color: colors.text,
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", monospace',
    }}>
      {/* Import Google Font */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap');

        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        ::-webkit-scrollbar-track {
          background: ${colors.bgPanel};
        }
        ::-webkit-scrollbar-thumb {
          background: ${colors.border};
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: ${colors.borderActive};
        }

        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        @keyframes glow {
          0%, 100% { box-shadow: 0 0 5px ${colors.accent}, 0 0 10px ${colors.accentGlow}; }
          50% { box-shadow: 0 0 10px ${colors.accent}, 0 0 20px ${colors.accentGlow}; }
        }
      `}</style>

      {/* Scanline effect overlay */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 1000,
        background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.1) 0px, rgba(0,0,0,0.1) 1px, transparent 1px, transparent 2px)',
        opacity: 0.3,
      }} />

      {/* Header */}
      <header style={{
        background: colors.bgPanel,
        borderBottom: `1px solid ${colors.border}`,
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              background: `linear-gradient(135deg, ${colors.accent}20, ${colors.cyan}20)`,
              border: `1px solid ${colors.accent}40`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Database size={20} style={{ color: colors.accent }} />
          </motion.div>
          <div>
            <h1 style={{
              fontSize: '18px',
              fontWeight: 600,
              letterSpacing: '2px',
              margin: 0,
              background: `linear-gradient(90deg, ${colors.accent}, ${colors.cyan})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              DATA TERMINAL
            </h1>
            <div style={{ fontSize: '10px', color: colors.textDim, letterSpacing: '1px' }}>
              FINAGENT DATABASE EXPLORER v1.0
            </div>
          </div>
        </div>

        {/* Date Offset Toggle */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '8px 16px',
          background: colors.bgCard,
          borderRadius: '8px',
          border: `1px solid ${applyDateOffset ? colors.accent : colors.border}`,
          transition: 'border-color 0.3s',
        }}>
          <Clock size={16} style={{ color: applyDateOffset ? colors.accent : colors.textMuted }} />
          <span style={{ fontSize: '12px', color: colors.textMuted }}>DATE OFFSET</span>
          <button
            onClick={() => setApplyDateOffset(!applyDateOffset)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {applyDateOffset ? (
              <ToggleRight size={28} style={{ color: colors.accent }} />
            ) : (
              <ToggleLeft size={28} style={{ color: colors.textMuted }} />
            )}
          </button>
          <span style={{
            fontSize: '10px',
            padding: '2px 6px',
            borderRadius: '4px',
            background: applyDateOffset ? colors.accentGlow : 'transparent',
            color: applyDateOffset ? colors.accent : colors.textDim,
            border: `1px solid ${applyDateOffset ? colors.accent : colors.border}`,
          }}>
            {applyDateOffset ? 'ADJUSTED' : 'RAW'}
          </span>
        </div>
      </header>

      <div style={{ display: 'flex', minHeight: 'calc(100vh - 73px)' }}>
        {/* Sidebar - Table List */}
        <aside style={{
          width: '280px',
          background: colors.bgPanel,
          borderRight: `1px solid ${colors.border}`,
          padding: '20px 0',
          flexShrink: 0,
        }}>
          <div style={{
            padding: '0 16px 16px',
            borderBottom: `1px solid ${colors.border}`,
            marginBottom: '8px',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '11px',
              color: colors.textMuted,
              letterSpacing: '2px',
            }}>
              <Terminal size={12} />
              AVAILABLE TABLES
            </div>
          </div>

          <nav>
            {tables.map((table, index) => (
              <motion.button
                key={table.name}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => handleSelectTable(table.name)}
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  background: selectedTable === table.name ? colors.accentGlow : 'transparent',
                  border: 'none',
                  borderLeft: `3px solid ${selectedTable === table.name ? colors.accent : 'transparent'}`,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  transition: 'all 0.2s',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (selectedTable !== table.name) {
                    e.currentTarget.style.background = colors.bgHover;
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedTable !== table.name) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <Table size={16} style={{
                  color: selectedTable === table.name ? colors.accent : colors.textMuted
                }} />
                <div>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: selectedTable === table.name ? colors.accent : colors.text,
                  }}>
                    {table.displayName}
                  </div>
                  <div style={{
                    fontSize: '10px',
                    color: colors.textDim,
                    fontFamily: 'monospace',
                  }}>
                    {table.name}
                  </div>
                </div>
              </motion.button>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main style={{ flex: 1, padding: '24px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <AnimatePresence mode="wait">
            {!selectedTable ? (
              // Empty state
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: '20px',
                }}
              >
                <motion.div
                  animate={{
                    boxShadow: [
                      `0 0 20px ${colors.accentGlow}`,
                      `0 0 40px ${colors.accentGlow}`,
                      `0 0 20px ${colors.accentGlow}`,
                    ]
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                  style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    background: colors.bgCard,
                    border: `2px solid ${colors.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Zap size={32} style={{ color: colors.accent }} />
                </motion.div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    fontSize: '16px',
                    color: colors.textMuted,
                    letterSpacing: '2px',
                    marginBottom: '8px',
                  }}>
                    SELECT A TABLE TO BEGIN
                  </div>
                  <div style={{ fontSize: '12px', color: colors.textDim }}>
                    Choose from the sidebar to explore database contents
                  </div>
                </div>
              </motion.div>
            ) : loading && !tableData ? (
              // Loading state
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                <Loader2 size={32} style={{ color: colors.accent, animation: 'spin 1s linear infinite' }} />
                <div style={{ fontSize: '12px', color: colors.textMuted, letterSpacing: '2px' }}>
                  FETCHING DATA...
                </div>
              </motion.div>
            ) : tableData ? (
              // Table view
              <motion.div
                key="table"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
              >
                {/* Toolbar */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '16px',
                  gap: '16px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <h2 style={{
                      fontSize: '20px',
                      fontWeight: 600,
                      margin: 0,
                      color: colors.text,
                    }}>
                      {tableData.displayName}
                    </h2>
                    <div style={{
                      fontSize: '11px',
                      padding: '4px 10px',
                      borderRadius: '4px',
                      background: colors.bgCard,
                      border: `1px solid ${colors.border}`,
                      color: colors.textMuted,
                    }}>
                      {tableData.totalCount.toLocaleString()} RECORDS
                    </div>
                    {loading && (
                      <Loader2 size={16} style={{ color: colors.accent, animation: 'spin 1s linear infinite' }} />
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Search */}
                    <div style={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                    }}>
                      <Search size={14} style={{
                        position: 'absolute',
                        left: '12px',
                        color: colors.textMuted,
                      }} />
                      <input
                        type="text"
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                          width: '200px',
                          padding: '8px 12px 8px 36px',
                          background: colors.bgCard,
                          border: `1px solid ${colors.border}`,
                          borderRadius: '6px',
                          color: colors.text,
                          fontSize: '12px',
                          outline: 'none',
                          fontFamily: 'inherit',
                        }}
                      />
                    </div>

                    {/* Export Button */}
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={exportCSV}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 16px',
                        background: `linear-gradient(135deg, ${colors.accent}20, ${colors.cyan}20)`,
                        border: `1px solid ${colors.accent}50`,
                        borderRadius: '6px',
                        color: colors.accent,
                        fontSize: '12px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        letterSpacing: '1px',
                      }}
                    >
                      <Download size={14} />
                      EXPORT CSV
                    </motion.button>
                  </div>
                </div>

                {/* Table Container */}
                <div style={{
                  flex: 1,
                  background: colors.bgCard,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                }}>
                  {/* Table */}
                  <div style={{ flex: 1, overflow: 'auto' }}>
                    <table style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '12px',
                    }}>
                      <thead>
                        <tr style={{
                          background: colors.bgPanel,
                          position: 'sticky',
                          top: 0,
                          zIndex: 10,
                        }}>
                          {tableData.columns.map((col) => (
                            <th
                              key={col}
                              style={{
                                padding: '12px 16px',
                                textAlign: 'left',
                                fontWeight: 600,
                                color: isDateColumn(col) && applyDateOffset ? colors.accent : colors.textMuted,
                                borderBottom: `1px solid ${colors.border}`,
                                whiteSpace: 'nowrap',
                                letterSpacing: '1px',
                                fontSize: '10px',
                                textTransform: 'uppercase',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {col}
                                {isDateColumn(col) && (
                                  <Clock size={10} style={{
                                    color: applyDateOffset ? colors.accent : colors.textDim,
                                    opacity: applyDateOffset ? 1 : 0.5,
                                  }} />
                                )}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredData.map((row, rowIndex) => (
                          <motion.tr
                            key={rowIndex}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: rowIndex * 0.01 }}
                            style={{
                              borderBottom: `1px solid ${colors.border}`,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = colors.bgHover;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            {tableData.columns.map((col) => (
                              <td
                                key={col}
                                style={{
                                  padding: '10px 16px',
                                  color: isDateColumn(col) && applyDateOffset ? colors.cyan : colors.text,
                                  whiteSpace: 'nowrap',
                                  maxWidth: '300px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                                title={String(row[col] ?? '')}
                              >
                                {formatCellValue(row[col], col)}
                              </td>
                            ))}
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderTop: `1px solid ${colors.border}`,
                    background: colors.bgPanel,
                  }}>
                    <div style={{ fontSize: '11px', color: colors.textMuted }}>
                      Showing {tableData.offset + 1} - {Math.min(tableData.offset + tableData.limit, tableData.totalCount)} of {tableData.totalCount.toLocaleString()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 0}
                        style={{
                          padding: '6px 12px',
                          background: currentPage === 0 ? colors.bgCard : colors.bgHover,
                          border: `1px solid ${colors.border}`,
                          borderRadius: '4px',
                          color: currentPage === 0 ? colors.textDim : colors.text,
                          cursor: currentPage === 0 ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          fontFamily: 'inherit',
                        }}
                      >
                        <ChevronLeft size={14} />
                        PREV
                      </button>
                      <div style={{
                        padding: '6px 12px',
                        background: colors.bgCard,
                        border: `1px solid ${colors.accent}50`,
                        borderRadius: '4px',
                        fontSize: '11px',
                        color: colors.accent,
                      }}>
                        {currentPage + 1} / {totalPages}
                      </div>
                      <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage >= totalPages - 1}
                        style={{
                          padding: '6px 12px',
                          background: currentPage >= totalPages - 1 ? colors.bgCard : colors.bgHover,
                          border: `1px solid ${colors.border}`,
                          borderRadius: '4px',
                          color: currentPage >= totalPages - 1 ? colors.textDim : colors.text,
                          cursor: currentPage >= totalPages - 1 ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          fontFamily: 'inherit',
                        }}
                      >
                        NEXT
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Date offset info */}
                {applyDateOffset && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      marginTop: '16px',
                      padding: '12px 16px',
                      background: colors.accentGlow,
                      border: `1px solid ${colors.accent}40`,
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      fontSize: '11px',
                    }}
                  >
                    <Clock size={16} style={{ color: colors.accent }} />
                    <span style={{ color: colors.textMuted }}>
                      Date offset applied: Demo dates (2025) converted to display relative to today.
                      Date columns highlighted in <span style={{ color: colors.cyan }}>cyan</span>.
                    </span>
                  </motion.div>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </main>
      </div>

      {/* Status bar */}
      <footer style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '8px 24px',
        background: colors.bgPanel,
        borderTop: `1px solid ${colors.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '10px',
        color: colors.textDim,
        letterSpacing: '1px',
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: colors.accent,
              animation: 'pulse 2s infinite',
            }} />
            CONNECTED
          </div>
          <span>|</span>
          <span>SUPABASE POSTGRESQL</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span>DEMO_TODAY: 2025-11-20</span>
          <span>|</span>
          <span>{new Date().toLocaleTimeString()}</span>
        </div>
      </footer>

      {/* Spin keyframe */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default DataExplorer;
