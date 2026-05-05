import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ContactProfile } from '@lib/contacts-directory';

type ContactProfileInput = Omit<ContactProfile, 'email' | 'accountId'> & {
  accountId: string;
  email: string;
};

type ContactProfileState = {
  profiles: ContactProfile[];
  saveProfile: (profile: ContactProfileInput) => void;
  deleteProfile: (accountId: string, email: string) => void;
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const useContactProfileStore = create<ContactProfileState>()(
  persist(
    (set) => ({
      profiles: [],
      saveProfile: (profile) =>
        set((state) => {
          const nextProfile = {
            accountId: profile.accountId,
            email: normalizeEmail(profile.email),
            name: profile.name,
            notes: profile.notes
          };

          const existingIndex = state.profiles.findIndex(
            (candidate) =>
              candidate.accountId === nextProfile.accountId && candidate.email === nextProfile.email
          );

          if (existingIndex === -1) {
            return {
              profiles: [...state.profiles, nextProfile]
            };
          }

          return {
            profiles: state.profiles.map((candidate, index) =>
              index === existingIndex ? nextProfile : candidate
            )
          };
        }),
      deleteProfile: (accountId, email) =>
        set((state) => ({
          profiles: state.profiles.filter(
            (candidate) =>
              !(candidate.accountId === accountId && candidate.email === normalizeEmail(email))
          )
        }))
    }),
    {
      name: 'open-mail-contact-profiles'
    }
  )
);
