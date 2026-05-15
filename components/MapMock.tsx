import React from 'react';
import { StyleSheet, View, Text, Dimensions } from 'react-native';
import Svg, { Circle, Path, G, Rect } from 'react-native-svg';

const { width, height } = Dimensions.get('window');

interface MapMockProps {
    showRoute?: boolean;
    driverProgress?: number; // 0 to 1
    showHeatmap?: boolean;
}

export const MapMock: React.FC<MapMockProps> = ({ showRoute = false, driverProgress = 0, showHeatmap = false }) => {
    // Route Points
    const p1 = { x: width * 0.2, y: height * 0.6 };
    const p2 = { x: width * 0.5, y: height * 0.5 };
    const p3 = { x: width * 0.8, y: height * 0.7 };

    // Calculate Driver Position based on progress (0 to 1)
    let driverX = p1.x;
    let driverY = p1.y;

    if (showRoute) {
        if (driverProgress <= 0.5) {
            // First leg (0 to 0.5 maps to 0 to 1 of segment 1)
            const t = driverProgress * 2;
            driverX = p1.x + (p2.x - p1.x) * t;
            driverY = p1.y + (p2.y - p1.y) * t;
        } else {
            // Second leg (0.5 to 1 maps to 0 to 1 of segment 2)
            const t = (driverProgress - 0.5) * 2;
            driverX = p2.x + (p3.x - p2.x) * t;
            driverY = p2.y + (p3.y - p2.y) * t;
        }
    }

    return (
        <View style={styles.container}>
            {/* Background Grid Simulation */}
            <Svg height="100%" width="100%" viewBox={`0 0 ${width} ${height}`}>
                <Rect x="0" y="0" width={width} height={height} fill="#F3F4F6" />

                {/* Simple Road Grid */}
                <G stroke="#E5E7EB" strokeWidth="2">
                    {[...Array(10)].map((_, i) => (
                        <React.Fragment key={i}>
                            <Path d={`M ${i * 50} 0 L ${i * 50} ${height}`} />
                            <Path d={`M 0 ${i * 50} L ${width} ${i * 50}`} />
                        </React.Fragment>
                    ))}
                </G>

                {/* Heatmap Zones */}
                {showHeatmap && (
                    <G>
                        {/* High Demand Zone (Red) - Market Area */}
                        <Circle cx={width * 0.8} cy={height * 0.3} r="80" fill="rgba(239, 68, 68, 0.2)" />
                        <Circle cx={width * 0.8} cy={height * 0.3} r="50" fill="rgba(239, 68, 68, 0.4)" />

                        {/* Medium Demand Zone (Orange) - Residential */}
                        <Circle cx={width * 0.2} cy={height * 0.6} r="60" fill="rgba(245, 158, 11, 0.3)" />

                        {/* Low Demand Zone (Yellow) - Outskirts */}
                        <Circle cx={width * 0.5} cy={height * 0.8} r="40" fill="rgba(252, 211, 77, 0.2)" />
                    </G>
                )}

                {/* Landmarks */}
                <G>
                    <Circle cx={p3.x} cy={p3.y} r="8" fill="#D1D5DB" />
                    <Text style={{ position: 'absolute', left: p3.x + 12, top: p3.y - 10, fontSize: 10, color: '#9CA3AF', fontWeight: 'bold' }}>
                        Kasoa Market
                    </Text>
                </G>

                {/* Route Simulation if requested */}
                {showRoute && (
                    <G>
                        <Path
                            d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y}`}
                            stroke="#06C167"
                            strokeWidth="4"
                            fill="none"
                            strokeDasharray="10, 5"
                        />
                        {/* Start Point */}
                        <Circle cx={p1.x} cy={p1.y} r="6" fill="#000" />
                        {/* Destination */}
                        <Circle cx={p3.x} cy={p3.y} r="6" fill="#EF4444" />

                        {/* Dynamic Driver Marker */}
                        <G x={driverX} y={driverY}>
                            <Circle cx={0} cy={0} r="12" fill="rgba(6, 193, 103, 0.3)" />
                            <Circle cx={0} cy={0} r="6" fill="#06C167" stroke="#fff" strokeWidth="2" />
                        </G>
                    </G>
                )}

                {/* "You" Marker (Idle state) */}
                {!showRoute && (
                    <G>
                        <Circle cx={width * 0.5} cy={height * 0.4} r="10" fill="rgba(6, 193, 103, 0.2)" />
                        <Circle cx={width * 0.5} cy={height * 0.4} r="5" fill="#06C167" stroke="#fff" strokeWidth="2" />
                    </G>
                )}
            </Svg>

            <View style={styles.badge}>
                <Text style={styles.badgeText}>Real-time Map Simulation</Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        overflow: 'hidden',
    },
    badge: {
        position: 'absolute',
        bottom: 20,
        right: 20,
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
    },
    badgeText: {
        color: '#fff',
        fontSize: 8,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
});
