// src/components/TomTomMap.jsx
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGeolocation } from '../hooks/useGeolocation';
import { TOMTOM_CONFIG } from '../config/busConfig';

const TomTomMap = ({ center, markers = [], onError }) => {
  const mapRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const { location, error: geoError } = useGeolocation({
    enableHighAccuracy: true,
    smoothTransition: true
  });

  // Memoizar marcadores para evitar re-renders
  const memoizedMarkers = useMemo(() => markers, [markers]);

  useEffect(() => {
    // Carregar script do TomTom
    const loadTomTomMap = async () => {
      try {
        const script = document.createElement('script');
        script.src = `https://api.tomtom.com/maps-sdk-for-web/cdn/6.x/6.23.0/maps/maps-web.min.js`;
        script.onload = () => {
          if (window.tt && window.tt.map) {
            initializeMap();
          }
        };
        script.onerror = () => {
          setLoadError('Erro ao carregar mapa');
          onError?.('Erro ao carregar mapa');
        };
        document.head.appendChild(script);
      } catch (err) {
        setLoadError(err.message);
        onError?.(err.message);
      }
    };

    loadTomTomMap();
  }, []);

  const initializeMap = () => {
    if (!mapRef.current) return;

    const map = window.tt.map({
      key: TOMTOM_CONFIG.API_KEY,
      container: mapRef.current,
      center: center || [TOMTOM_CONFIG.CENTRO_BRASILIA.lon, TOMTOM_CONFIG.CENTRO_BRASILIA.lat],
      zoom: 14,
      style: 'https://api.tomtom.com/style/2/custom/style/main.json', // Estilo clean "main"
      language: 'pt-BR'
    });

    // Adicionar controle de navegação
    map.addControl(new window.tt.NavigationControl(), 'top-left');

    // Adicionar marcadores memoizados
    memoizedMarkers.forEach(marker => {
      const el = document.createElement('div');
      el.className = 'custom-marker';
      el.innerHTML = marker.icon || '📍';
      el.style.fontSize = '24px';
      
      new window.tt.Marker({ element: el })
        .setLngLat([marker.lon, marker.lat])
        .setPopup(new window.tt.Popup().setHTML(marker.popup || ''))
        .addTo(map);
    });

    setMapLoaded(true);
  };

  // Atualizar posição do usuário com transição suave
  useEffect(() => {
    if (!mapRef.current || !location) return;
    
    const mapContainer = mapRef.current;
    mapContainer.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    
    // Atualizar centro do mapa suavemente
    const currentCenter = mapRef.current._map?.getCenter();
    if (currentCenter) {
      const newCenter = {
        lng: currentCenter.lng + (location.lon - currentCenter.lng) * 0.1,
        lat: currentCenter.lat + (location.lat - currentCenter.lat) * 0.1
      };
      mapRef.current._map?.easeTo({ 
        center: [newCenter.lng, newCenter.lat],
        duration: 1000,
        easing: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
      });
    }
  }, [location]);

  if (loadError) {
    return (
      <div className="w-full h-96 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        <p className="text-sm text-gray-500">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-96 rounded-2xl overflow-hidden">
      <div 
        ref={mapRef} 
        className="w-full h-full"
        style={{ 
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          willChange: 'transform'
        }}
      />
      
      {/* Indicador de localização do usuário */}
      <AnimatePresence>
        {location && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="absolute bottom-4 right-4 bg-white dark:bg-gray-800 rounded-full p-2 shadow-lg"
          >
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-xs font-medium">GPS Ativo</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Erro de localização */}
      {geoError && (
        <div className="absolute top-4 left-4 bg-red-100 dark:bg-red-900/30 rounded-lg p-3 max-w-xs">
          <p className="text-xs text-red-700 dark:text-red-400">{geoError}</p>
        </div>
      )}
    </div>
  );
};

export default React.memo(TomTomMap);