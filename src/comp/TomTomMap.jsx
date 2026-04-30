// src/components/BadgeTempo.jsx
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TEMPO_CONFIG, TEMPO_ESTADOS } from '../config/busConfig';

const BadgeTempo = ({ gps_active, time, modo = 'onibus' }) => {
  // Determinar estado com base em gps_active e tempo
  const getEstado = () => {
    if (!gps_active) return TEMPO_ESTADOS.SCHEDULED;
    if (time <= TEMPO_CONFIG.LIMIAR_IMINENTE_MIN) return TEMPO_ESTADOS.IMMINENT;
    return TEMPO_ESTADOS.LIVE;
  };

  const estado = getEstado();
  const cor = TEMPO_CONFIG.CORES[estado.toUpperCase()] || TEMPO_CONFIG.CORES.SCHEDULED;
  const texto = estado === TEMPO_ESTADOS.IMMINENT 
    ? TEMPO_CONFIG.TEXTOS.IMMINENT 
    : estado === TEMPO_ESTADOS.LIVE 
      ? TEMPO_CONFIG.TEXTOS.LIVE 
      : TEMPO_CONFIG.TEXTOS.SCHEDULED;

  // Classes Tailwind dinâmicas baseadas no estado
  const getClasses = () => {
    switch(estado) {
      case TEMPO_ESTADOS.LIVE:
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800';
      case TEMPO_ESTADOS.IMMINENT:
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800 animate-pulse';
      case TEMPO_ESTADOS.SCHEDULED:
        return 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700';
      default:
        return 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={estado}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold tracking-wide ${getClasses()}`}
      >
        {/* Indicador de pulso para LIVE */}
        {(estado === TEMPO_ESTADOS.LIVE || estado === TEMPO_ESTADOS.IMMINENT) && (
          <span 
            className="relative flex h-2 w-2"
            style={{ minWidth: '8px' }}
          >
            <span 
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75`}
              style={{ backgroundColor: cor }}
            />
            <span 
              className="relative inline-flex rounded-full h-2 w-2"
              style={{ backgroundColor: cor }}
            />
          </span>
        )}
        
        {/* Ícone para modo metrô */}
        {modo === 'metro' && (
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2c-4.42 0-8 .5-8 4v10.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h12v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-7H6V6h5v4zm2 0V6h5v4h-5zm3.5 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
          </svg>
        )}
        
        <span>{texto}</span>
        
        {/* Exibir tempo apenas se LIVE e > 1min */}
        {estado === TEMPO_ESTADOS.LIVE && time > 1 && (
          <span className="font-normal opacity-80">{time}min</span>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default React.memo(BadgeTempo);