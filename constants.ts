
import React from 'react';
import { TrashVehicle, LocationItem, TrashType } from './types';

export const TRASH_VEHICLES: TrashVehicle[] = [
  {
    id: '1',
    name: 'Tricycle Truck',
    capacity: '500kg',
    price: 'GH₵ 40.00',
    time: '15 min',
    type: 'Narrow Roads',
    icon: '🛺',
    description: 'Perfect for informal areas and narrow lanes.'
  },
  {
    id: '2',
    name: 'Mini Truck',
    capacity: '2 Tons',
    price: 'GH₵ 85.00',
    time: '20 min',
    type: 'Neighborhood',
    icon: '🚚',
    description: 'Ideal for shops, restaurants and estates.'
  },
  {
    id: '3',
    name: 'Large Trash Truck',
    capacity: '10 Tons',
    price: 'GH₵ 250.00',
    time: '45 min',
    type: 'Bulk Waste',
    icon: '🚛',
    description: 'Best for markets, construction sites and bulk waste.'
  }
];

export const RECENT_LOCATIONS: LocationItem[] = [
  {
    name: 'Kasoa New Market',
    address: 'Bawjiase Road, Kasoa, Central Region'
  },
  {
    name: 'West Hills Mall',
    address: 'Winneba Highway, Dunkonaa, Accra'
  },
  {
    name: 'Kasoa Galleria',
    address: 'Old Barrier, Kasoa'
  },
  {
    name: 'Budumburam Camp',
    address: 'Liberia Camp, Kasoa'
  }
];

export const NEAR_YOU = [
  { name: 'Kasoa Transfer Station', time: '10 min', dist: '1.5km', icon: '♻️' },
  { name: 'Accra Waste Depot', time: '25 min', dist: '8.2km', icon: '🗑️' },
  { name: 'Plastic Recycle Hub', time: '15 min', dist: '3.0km', icon: '🥤' }
];

export const TRASH_TYPES = [
  { id: '1', name: TrashType.HOUSEHOLD, icon: '🏠' },
  { id: '2', name: TrashType.MARKET, icon: '🍍' },
  { id: '3', name: TrashType.PLASTIC, icon: '♻️' },
  { id: '4', name: TrashType.MIXED, icon: '📦' }
];
