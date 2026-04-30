// src/hooks/useGeolocation.js
import { useState, useEffect, useRef, useCallback } from 'react';

export const useGeolocation = (options = {}) => {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);
  const [isWatching, setIsWatching] = useState(false);
  const watchIdRef = useRef(null);
  
  const {
    enableHighAccuracy = true,
    timeout = 15000,
    maximumAge = 0,
    smoothTransition = true
  } = options;

  // Função para atualizar localização com transição suave
  const updateLocation = useCallback((position) => {
    const newLocation = {
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      accuracy: position.coords.accuracy,
      heading: position.coords.heading,
      speed: position.coords.speed,
      timestamp: position.timestamp
    };

    setLocation(prev => {
      if (!prev || !smoothTransition) return newLocation;
      
      // Interpolação suave para evitar saltos
      const smoothingFactor = 0.3;
      return {
        ...newLocation,
        lat: prev.lat + (newLocation.lat - prev.lat) * smoothingFactor,
        lon: prev.lon + (newLocation.lon - prev.lon) * smoothingFactor
      };
    });
  }, [smoothTransition]);

  // Iniciar watchPosition
  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocalização não suportada');
      return;
    }

    setError(null);
    setIsWatching(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      updateLocation,
      (err) => {
        let errorMessage = 'Erro ao obter localização';
        switch(err.code) {
          case err.PERMISSION_DENIED:
            errorMessage = 'Permissão de localização negada. Por favor, ative a localização.';
            break;
          case err.POSITION_UNAVAILABLE:
            errorMessage = 'Localização indisponível no momento.';
            break;
          case err.TIMEOUT:
            errorMessage = 'Tempo limite excedido. Tentando novamente...';
            break;
        }
        setError(errorMessage);
      },
      { enableHighAccuracy, timeout, maximumAge }
    );
  }, [updateLocation, enableHighAccuracy, timeout, maximumAge]);

  // Parar watchPosition
  const stopWatching = useCallback(() => {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsWatching(false);
  }, []);

  // Limpar ao desmontar
  useEffect(() => {
    return () => stopWatching();
  }, [stopWatching]);

  return { location, error, isWatching, startWatching, stopWatching };
};