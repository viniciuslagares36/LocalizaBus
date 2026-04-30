// src/components/RouteResultRefatorado.jsx
import React, { useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bus, Train, Clock, MapPin, Footprints, ArrowRight } from 'lucide-react';
import BadgeTempo from './BadgeTempo';
import { calcularDistancia, calcularTempoCaminhada, BACIA_CORES } from '../config/busConfig';

const spring = { type: 'spring', stiffness: 120, damping: 22 };

// Identificar bacia pelo código da linha
const identificarBacia = (codigoLinha, modo) => {
  if (String(modo || '').toUpperCase().includes('RAIL') || String(modo || '').toLowerCase().includes('metro')) {
    return Object.values(BACIA_CORES).find(
      bacia => bacia.tipo === 'metro' && bacia.codigosLinha.includes(codigoLinha)
    );
  }
  return Object.values(BACIA_CORES).find(
    bacia => bacia.tipo === 'onibus' && bacia.codigosLinha.some(codigo => String(codigoLinha || '').includes(codigo))
  );
};

const RouteResultRefatorado = ({ routes, origin, destination, loading, userLocation }) => {
  // Memoizar rotas processadas com dados de caminhada
  const processedRoutes = useMemo(() => {
    if (!routes?.length) return [];
    
    return routes.map(route => {
      const bacia = identificarBacia(route.line, route.mode) || { cor: route.isLive ? '#22c55e' : '#0a84ff', nome: route.mode === 'BUS' ? 'Ônibus' : (route.mode || 'Rota'), tipo: route.mode === 'BUS' ? 'onibus' : 'metro' };
      
      // Calcular distância e tempo de caminhada se tiver localização do usuário
      let caminhadaInfo = null;
      if (userLocation && route.fromStop) {
        const distancia = calcularDistancia(
          userLocation.lat, 
          userLocation.lon,
          route.lat || -15.7934, // fallback para centro de Brasília
          route.lon || -47.8823
        );
        const tempoCaminhada = calcularTempoCaminhada(distancia);
        
        caminhadaInfo = {
          distancia: distancia.toFixed(1),
          tempo: Math.ceil(tempoCaminhada)
        };
      }
      
      return {
        ...route,
        bacia,
        caminhadaInfo,
        // Determinar estado do badge
        badgeEstado: {
          gps_active: route.isLive || false,
          time: route.time || 0,
          modo: bacia?.tipo || (route.mode === 'BUS' ? 'onibus' : 'metro')
        }
      };
    });
  }, [routes, userLocation]);

  // Memoizar se há rotas ao vivo
  const hasLiveRoutes = useMemo(() => 
    processedRoutes.some(r => r.isLive), [processedRoutes]
  );

  if (loading) {
    return (
      <div className="mt-6 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 rounded-2xl animate-pulse bg-gray-200 dark:bg-gray-700" />
        ))}
      </div>
    );
  }

  if (!processedRoutes?.length) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={spring} 
      className="mt-7 space-y-4"
    >
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1">
            Rotas SEMOB / DFTrans
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-[140px]">
              {origin}
            </p>
            <ArrowRight className="h-3 w-3 text-gray-400 flex-shrink-0" />
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-[140px]">
              {destination}
            </p>
          </div>
        </div>
        <span className="text-xs font-medium text-gray-500 flex-shrink-0 mt-1">
          {processedRoutes.length} {processedRoutes.length === 1 ? 'opção' : 'opções'}
        </span>
      </div>

      {/* Indicador de status GPS */}
      <div className="flex items-center gap-2">
        <div className={`h-1.5 w-1.5 rounded-full animate-pulse ${
          hasLiveRoutes ? 'bg-green-500' : 'bg-gray-400'
        }`} />
        <span className={`text-[10px] font-semibold ${
          hasLiveRoutes 
            ? 'text-green-600 dark:text-green-400' 
            : 'text-gray-500 dark:text-gray-400'
        }`}>
          {hasLiveRoutes 
            ? '🚀 GPS REAL — Veículos ao vivo' 
            : 'Dados de horários — SEMOB/DFTrans'}
        </span>
      </div>

      {/* Lista de Rotas */}
      <div className="space-y-2.5">
        <AnimatePresence>
          {processedRoutes.map((route, idx) => (
            <motion.div
              key={route.id}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ delay: idx * 0.06, ...spring }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.99 }}
              className={`rounded-2xl border p-4 cursor-pointer transition-all duration-200 ${
                route.isLive 
                  ? 'border-green-300/60 bg-green-50/40 dark:border-green-800/50 dark:bg-green-900/10 hover:shadow-lg'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-md'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Informações da rota */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {/* Ícone da Bacia */}
                  {route.bacia && (
                    <div 
                      className="rounded-full p-2 flex-shrink-0"
                      style={{ 
                        backgroundColor: `${route.bacia.cor}15`,
                        border: `1px solid ${route.bacia.cor}30`
                      }}
                    >
                      {route.bacia.tipo === 'metro' ? (
                        <Train className="h-4 w-4" style={{ color: route.bacia.cor }} strokeWidth={1.5} />
                      ) : (
                        <Bus className="h-4 w-4" style={{ color: route.bacia.cor }} strokeWidth={1.5} />
                      )}
                    </div>
                  )}

                  {/* Detalhes da Linha */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      {/* Nome da Bacia e Linha */}
                      {route.bacia && (
                        <span 
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ 
                            backgroundColor: `${route.bacia.cor}15`,
                            color: route.bacia.cor
                          }}
                        >
                          {route.bacia.nome}
                        </span>
                      )}
                      <span className="font-semibold text-sm text-gray-900 dark:text-white tracking-tight">
                        Linha {route.line}
                      </span>
                    </div>

                    {/* Métricas */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-gray-400" strokeWidth={1.5} />
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                          {route.time} min
                        </span>
                      </div>
                      
                      {route.stops && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-gray-400" strokeWidth={1.5} />
                          <span className="text-xs text-gray-600 dark:text-gray-400">
                            {route.stops} paradas
                          </span>
                        </div>
                      )}

                      {/* Informações de Caminhada */}
                      {route.caminhadaInfo && (
                        <div className="flex items-center gap-1">
                          <Footprints className="h-3 w-3 text-gray-400" strokeWidth={1.5} />
                          <span className="text-xs text-gray-600 dark:text-gray-400">
                            {route.caminhadaInfo.distancia}km • {route.caminhadaInfo.tempo}min
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Ponto de Embarque */}
                    {route.fromStop && (
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 truncate">
                        Embarque: {route.fromStop}
                      </p>
                    )}
                  </div>
                </div>

                {/* Badge de Tempo + Botão */}
                <div className="flex items-center gap-2 self-start sm:self-center">
                  <BadgeTempo
                    gps_active={route.badgeEstado.gps_active}
                    time={route.badgeEstado.time}
                    modo={route.badgeEstado.modo}
                  />
                  
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 ${
                      route.isLive ? 'bg-green-600' : 'bg-blue-500'
                    }`}
                  >
                    {route.isLive ? 'Ver mapa' : 'Detalhes'}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default React.memo(RouteResultRefatorado);