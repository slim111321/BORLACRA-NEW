import React, { useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { usePaystack } from 'react-native-paystack-webview';

interface PaymentComponentProps {
    amount: number;
    email: string;
    metadata?: any;
    subaccount?: string;
    onSuccess: (res: any) => void;
    onCancel: () => void;
}

export const PaymentComponent: React.FC<PaymentComponentProps> = ({ amount, email, metadata, subaccount, onSuccess, onCancel }) => {
    const { popup } = usePaystack();

    const hasStartedRef = React.useRef(false);

    useEffect(() => {
        if (popup && !hasStartedRef.current) {
            hasStartedRef.current = true;
            popup.checkout({
                email,
                amount: amount * 100, // Paystack v5 expects number (in kobo/pesewas)
                metadata: metadata || {},
                subaccount: subaccount || "",
                onSuccess,
                onCancel,
            });
        }
    }, [popup, email, amount, metadata, subaccount, onSuccess, onCancel]);

    return (
        <View style={styles.container}>
            <ActivityIndicator size="large" color="#06C167" />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
