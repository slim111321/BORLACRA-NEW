import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';

// Fallback UI for the top-level Sentry.ErrorBoundary in index.ts. Without
// an error boundary, a render-time crash anywhere in the component tree
// (e.g. the map, per recent crash history) took down the entire app to a
// blank/native red-box screen with no way to recover short of force-
// quitting. This gives the user a way back in (resetError re-mounts the
// tree) instead of a dead end, and the boundary itself already reports the
// error to Sentry before this ever renders.
export function ErrorFallback({ resetError }: { error: unknown; componentStack: string; eventId: string; resetError: () => void }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>
          Borla ran into an unexpected error. This has been reported automatically — tap below to try again.
        </Text>
        <TouchableOpacity style={styles.button} onPress={resetError} activeOpacity={0.8}>
          <Text style={styles.buttonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  button: {
    backgroundColor: '#06C167',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
