'use client';

import { useState } from 'react';
import { v4 as uuid } from 'uuid';
import api from '@/lib/api';

interface Props {
  onProfileCreated: (id: string) => void;
}

interface ProfileResponse {
  id: string;
  username: string;
  deviceName: string;
  createdAt: string;
}

export default function ProfileForm({ onProfileCreated }: Props) {
  const [username, setUsername] = useState('');
  const [deviceName, setDeviceName] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const peerId = uuid();

    try {
      const response = await api.post<ProfileResponse>('/profile', {
        id: peerId,
        username,
        deviceName,
      });

      onProfileCreated(response.data.id);
    } catch (error) {
      console.error('Failed to create profile:', error);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 max-w-md mx-auto p-4 border rounded-lg shadow"
    >
      <h2 className="text-xl font-semibold text-center">Create Profile</h2>

      <input
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Enter your name"
        className="w-full p-2 border rounded"
        required
      />

      <input
        type="text"
        value={deviceName}
        onChange={(e) => setDeviceName(e.target.value)}
        placeholder="Enter device name"
        className="w-full p-2 border rounded"
        required
      />

      <button
        type="submit"
        className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
      >
        Create Profile
      </button>
    </form>
  );
}
