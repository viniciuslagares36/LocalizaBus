// src/config/busConfig.js
// Mapeamento de bacias do DF com cores e códigos de linha

export const BACIA_CORES = {
  PIRACICABANA: {
    cor: '#16a34a', // Verde
    nome: 'Verde',
    codigosLinha: ['0.001', '0.002', '0.003', '0.004', '0.005', '0.006'],
    tipo: 'onibus'
  },
  MARECHAL: {
    cor: '#ea580c', // Laranja
    nome: 'Laranja',
    codigosLinha: ['0.010', '0.011', '0.012', '0.013', '0.014'],
    tipo: 'onibus'
  },
  METRO_GREEN: {
    cor: '#16a34a',
    nome: 'Metrô Verde',
    codigosLinha: ['M.001'],
    tipo: 'metro'
  },
  METRO_ORANGE: {
    cor: '#ea580c',
    nome: 'Metrô Laranja',
    codigosLinha: ['M.002'],
    tipo: 'metro'
  }
};

// Estados de tempo para badges
export const TEMPO_ESTADOS = {
  LIVE: 'live',           // GPS ativo e > 1min
  IMMINENT: 'imminent',   // <= 1min (Agora!)
  SCHEDULED: 'scheduled'  // Sem GPS (Programado)
};

export const TEMPO_CONFIG = {
  LIMIAR_IMINENTE_MIN: 1, // 1 minuto para considerar "Agora!"
  CORES: {
    LIVE: '#22c55e',      // Verde
    IMMINENT: '#ef4444',  // Vermelho
    SCHEDULED: '#9ca3af'  // Cinza
  },
  TEXTOS: {
    LIVE: 'Ao Vivo',
    IMMINENT: 'Agora!',
    SCHEDULED: 'Programado'
  }
};

// Filtros TomTom otimizados
export const TOMTOM_CONFIG = {
  API_KEY: 'kVt12B5jgJTHfcvXLLDSPgcX6bz4f7R1',
  CENTRO_BRASILIA: {
    lat: -15.7934,
    lon: -47.8823
  },
  SEARCH_PARAMS: {
    idxSet: 'POI,PAD,STR',     // Priorizar POIs e endereços, ignorar CEPs
    countrySet: 'BR',
    categorySet: '9362',        // Transporte Público
    limit: 5,
    language: 'pt-BR'
  }
};

// Utilitário para calcular distância
export const calcularDistancia = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 + 
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * 
            Math.sin(dLon/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

// Utilitário para calcular tempo de caminhada (velocidade média 5km/h)
export const calcularTempoCaminhada = (distanciaKm) => {
  const velocidadeMedia = 5; // km/h
  return (distanciaKm / velocidadeMedia) * 60; // retorna em minutos
};