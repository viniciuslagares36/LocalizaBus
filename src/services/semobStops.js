import axios from 'axios';
import { DF_FAVORITE_PLACES } from '../data/dfPlaces';

const SEMOB_STOPS_URL =
  'https://otp.mobilibus.com/FY7J-lwk85QGbn/otp/routers/default/index/stops';

export const normalizeText = (text) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export const getAllSemobStops = async () => {
  const cacheKey = 'localizabus_semob_stops_v1';

  try {
    const cached = localStorage.getItem(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const response = await axios.get(SEMOB_STOPS_URL, {
      timeout: 20000
    });

    const stops = Array.isArray(response.data)
      ? response.data.map((stop) => ({
          name: stop.name,
          address: `${stop.name}, Brasília - DF`,
          position: {
            lat: stop.lat,
            lon: stop.lon
          },
          type: 'Parada',
          stopId: stop.id
        }))
      : [];

    localStorage.setItem(cacheKey, JSON.stringify(stops));

    return stops;
  } catch (error) {
    console.error('Erro ao buscar paradas SEMOB:', error);
    return [];
  }
};

export const findLocalDfPlaces = async (query) => {
  const safeQuery = normalizeText(query);

  if (!safeQuery || safeQuery.length < 2) {
    return [];
  }

  const favoriteResults = DF_FAVORITE_PLACES.filter((place) => {
    const haystack = normalizeText(`${place.name} ${place.address} ${place.type}`);
    return haystack.includes(safeQuery);
  });

  const allStops = await getAllSemobStops();

  const stopResults = allStops
    .filter((stop) => {
      const haystack = normalizeText(`${stop.name} ${stop.address}`);
      return haystack.includes(safeQuery);
    })
    .slice(0, 8);

  return [...favoriteResults, ...stopResults].slice(0, 10);
};