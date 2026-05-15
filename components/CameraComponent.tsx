import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { X, RefreshCw, Camera } from 'lucide-react-native';

interface CameraComponentProps {
    onCapture: (uri: string, base64: string) => void;
    onClose: () => void;
}

export const CameraComponent: React.FC<CameraComponentProps> = ({ onCapture, onClose }) => {
    const [facing, setFacing] = useState<CameraType>('back');
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView>(null);
    const [isCapturing, setIsCapturing] = useState(false);

    useEffect(() => {
        if (!permission) {
            requestPermission();
        }
    }, [permission, requestPermission]);

    if (!permission) {
        return <View style={styles.container} />; // Loading permission
    }

    if (!permission.granted) {
        return (
            <View style={styles.container}>
                <Text style={styles.message}>We need camera permission to estimate trash size.</Text>
                <TouchableOpacity style={styles.button} onPress={requestPermission}>
                    <Text style={styles.buttonText}>Grant Permission</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.button, { marginTop: 12, backgroundColor: '#374151' }]} onPress={onClose}>
                    <Text style={styles.buttonText}>Cancel</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const takePicture = async () => {
        if (cameraRef.current && !isCapturing) {
            setIsCapturing(true);
            try {
                const photo = await cameraRef.current.takePictureAsync({
                    quality: 0.7,
                    base64: true,
                });
                if (photo?.uri && photo?.base64) {
                    onCapture(photo.uri, photo.base64);
                }
            } catch (error) {
                Alert.alert("Error", "Failed to capture image");
                console.error(error);
            } finally {
                setIsCapturing(false);
            }
        }
    };

    function toggleCameraFacing() {
        setFacing(current => (current === 'back' ? 'front' : 'back'));
    }

    return (
        <View style={styles.container}>
            <CameraView style={styles.camera} facing={facing} ref={cameraRef} />
            <View style={[StyleSheet.absoluteFillObject, styles.overlay]}>
                {/* Top Bar */}
                <View style={styles.topBar}>
                    <TouchableOpacity onPress={onClose} style={styles.iconButton}>
                        <X size={28} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={toggleCameraFacing} style={styles.iconButton}>
                        <RefreshCw size={28} color="#fff" />
                    </TouchableOpacity>
                </View>

                {/* Guide Frame */}
                <View style={styles.guideFrame}>
                    <Text style={styles.guideText}>Align trash within frame</Text>
                </View>

                {/* Bottom Bar */}
                <View style={styles.bottomBar}>
                    <TouchableOpacity onPress={takePicture} disabled={isCapturing} style={styles.captureBtn}>
                        <View style={styles.captureBtnInner}>
                            {isCapturing ? <ActivityIndicator color="#000" /> : <Camera size={32} color="#000" />}
                        </View>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        backgroundColor: '#000',
    },
    message: {
        textAlign: 'center',
        paddingBottom: 10,
        color: '#fff',
    },
    camera: {
        flex: 1,
    },
    overlay: {
        flex: 1,
        backgroundColor: 'transparent',
        justifyContent: 'space-between',
    },
    topBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 20,
        paddingTop: 50,
    },
    iconButton: {
        padding: 10,
        backgroundColor: 'rgba(0,0,0,0.4)',
        borderRadius: 20,
    },
    guideFrame: {
        flex: 1,
        margin: 40,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.5)',
        borderRadius: 20,
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
    },
    guideText: {
        color: 'rgba(255,255,255,0.8)',
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: 8,
        borderRadius: 8,
    },
    bottomBar: {
        padding: 30,
        alignItems: 'center',
    },
    captureBtn: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    captureBtnInner: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    button: {
        alignSelf: 'center',
        backgroundColor: '#06C167',
        padding: 12,
        borderRadius: 8,
        width: 200,
        alignItems: 'center',
    },
    buttonText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: 'white',
    },
});
