import { registerRootComponent } from 'expo';
import * as Sentry from '@sentry/react-native';
import React from 'react';

import './lib/sentry';
import App from './App';
import { ErrorFallback } from './components/ErrorFallback';

// Sentry.ErrorBoundary catches render-time errors anywhere in the App tree
// (previously nothing did — a crash in any single screen, e.g. the map,
// took down the whole app to a blank/native red-box screen) and reports
// them to Sentry automatically before rendering the fallback UI.
function Root() {
  return (
    <Sentry.ErrorBoundary fallback={ErrorFallback}>
      <App />
    </Sentry.ErrorBoundary>
  );
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(Sentry.wrap(Root));
