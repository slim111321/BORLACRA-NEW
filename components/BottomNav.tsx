import React from 'react';
import { StyleSheet, View, TouchableOpacity, Text, Dimensions } from 'react-native';
import { Home, History, MessageSquare, User } from 'lucide-react-native';
import { AppStep, UserRole } from '../types';

interface BottomNavProps {
    activeStep: AppStep;
    onTabChange: (step: AppStep) => void;
    role: UserRole;
}

const { width } = Dimensions.get('window');

export const BottomNav: React.FC<BottomNavProps> = ({ activeStep, onTabChange, role }) => {
    const tabs = role === UserRole.COLLECTOR ? [
        { id: AppStep.COLLECTOR_DASHBOARD, icon: Home, label: 'Dashboard' },
        { id: AppStep.COLLECTOR_EARNINGS, icon: History, label: 'Earnings' },
        { id: AppStep.COLLECTOR_CHAT, icon: MessageSquare, label: 'Chat' },
        { id: AppStep.PROFILE, icon: User, label: 'Profile' },
    ] : [
        { id: AppStep.HOME, icon: Home, label: 'Home' },
        { id: AppStep.HISTORY, icon: History, label: 'History' },
        { id: AppStep.CHAT, icon: MessageSquare, label: 'Chat' },
        { id: AppStep.PROFILE, icon: User, label: 'Profile' },
    ];

    return (
        <View style={styles.container}>
            <View style={styles.navBar}>
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeStep === tab.id;
                    return (
                        <TouchableOpacity
                            key={tab.id}
                            activeOpacity={0.7}
                            onPress={() => onTabChange(tab.id)}
                            style={styles.tab}
                        >
                            <Icon
                                size={24}
                                color={isActive ? '#06C167' : '#9CA3AF'}
                                strokeWidth={isActive ? 2.5 : 2}
                            />
                            <Text style={[styles.label, { color: isActive ? '#06C167' : '#9CA3AF', fontWeight: isActive ? '700' : '500' }]}>
                                {tab.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 20,
        left: 20,
        right: 20,
        alignItems: 'center',
        zIndex: 1000,
    },
    navBar: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        width: width - 40,
        height: 70,
        borderRadius: 35,
        paddingHorizontal: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 10,
        alignItems: 'center',
        justifyContent: 'space-around',
        borderWidth: 1,
        borderColor: 'rgba(238,238,238,0.5)',
    },
    tab: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        width: (width - 60) / 4,
    },
    label: {
        fontSize: 10,
        marginTop: 4,
    },
});
