import React from 'react';
import { StyleSheet, Text, TouchableOpacity, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';

interface ButtonProps {
    children: string | React.ReactNode;
    onPress: () => void;
    variant?: 'primary' | 'outline' | 'secondary';
    fullWidth?: boolean;
    disabled?: boolean;
    isLoading?: boolean;
    style?: ViewStyle;
}

export const Button: React.FC<ButtonProps> = ({
    children,
    onPress,
    variant = 'primary',
    fullWidth = true,
    disabled = false,
    isLoading = false,
    style,
}) => {
    const getVariantStyles = () => {
        switch (variant) {
            case 'outline': return styles.outline;
            case 'secondary': return styles.secondary;
            default: return styles.primary;
        }
    };

    const getTextStyle = () => {
        switch (variant) {
            case 'outline': return styles.outlineText;
            case 'secondary': return styles.secondaryText;
            default: return styles.primaryText;
        }
    };

    return (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={onPress}
            disabled={disabled || isLoading}
            style={[
                styles.base,
                getVariantStyles(),
                fullWidth && styles.fullWidth,
                (disabled || isLoading) && styles.disabled,
                style,
            ]}
        >
            {isLoading ? (
                <ActivityIndicator color={variant === 'outline' ? '#06C167' : '#fff'} />
            ) : (
                <Text style={[styles.textBase, getTextStyle()]}>
                    {children}
                </Text>
            )}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    base: {
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    fullWidth: {
        width: '100%',
    },
    primary: {
        backgroundColor: '#06C167',
        shadowColor: '#06C167',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 4,
    },
    outline: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#eee',
    },
    secondary: {
        backgroundColor: '#eee',
    },
    disabled: {
        opacity: 0.5,
    },
    textBase: {
        fontSize: 18,
        fontWeight: '700',
    },
    primaryText: {
        color: '#fff',
    },
    outlineText: {
        color: '#000',
    },
    secondaryText: {
        color: '#000',
    },
});
