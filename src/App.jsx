import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import {
    getAuth,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail
} from 'firebase/auth';
import {
    getFirestore,
    collection,
    addDoc,
    onSnapshot,
    doc,
    deleteDoc,
    updateDoc,
    setDoc,
    getDoc,
    query,
    where,
    getDocs,
    setLogLevel,
    orderBy
} from 'firebase/firestore';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Clock, Flag, Plus, Trash2, Edit, Save, X, Target, Info, Calendar, Link as LinkIcon, User, LogOut, Award, Download, CheckSquare, Share2, ClipboardCopy, Moon, Sun, Gauge, BarChart2, ChevronDown, Milestone, TrendingDown, PartyPopper } from 'lucide-react';

// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// --- App ID ---
const appId = 'benedict-runs-default';

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Helper Functions ---
const timeToSeconds = (time) => {
    if (!time || typeof time !== 'string') return 0;
    const parts = time.split(':').map(Number);
    let seconds = 0;
    if (parts.length === 3) { // HH:MM:SS
        seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) { // MM:SS
        seconds = parts[0] * 60 + parts[1];
    } else if (parts.length === 1) { // SS
        seconds = parts[0];
    }
    return isNaN(seconds) ? 0 : seconds;
};

const distanceToMiles = (distance) => {
    if (!distance || typeof distance !== 'string') return 0;
    const lowerCaseDistance = distance.toLowerCase().trim();

    switch (lowerCaseDistance) {
        case '5k': return 3.10686;
        case '10k': return 6.21371;
        case '1/2 marathon': return 13.1094;
        case 'marathon': return 26.2188;
    }

    const numberMatch = lowerCaseDistance.match(/[\d.]+/);
    if (!numberMatch) return 0;

    const numericalValue = parseFloat(numberMatch[0]);
    if (isNaN(numericalValue)) return 0;

    if (lowerCaseDistance.includes('mile') || lowerCaseDistance.includes('mi') || lowerCaseDistance.includes('m')) {
        return numericalValue;
    }
    if (lowerCaseDistance.includes('km') || (lowerCaseDistance.includes('k') && !lowerCaseDistance.includes('mile'))) {
        return numericalValue * 0.621371;
    }
    if (lowerCaseDistance.includes('meter')) {
        return numericalValue / 1609.34;
    }

    return numericalValue;
};

const formatPace = (time, distance) => {
    const totalSeconds = timeToSeconds(time);
    const totalMiles = distanceToMiles(distance);

    if (totalSeconds === 0 || totalMiles === 0) return 'N/A';

    const secondsPerMile = totalSeconds / totalMiles;
    const paceMinutes = Math.floor(secondsPerMile / 60);
    const paceSeconds = Math.round(secondsPerMile % 60);

    return `${paceMinutes}:${paceSeconds.toString().padStart(2, '0')}`;
};

const formatSeconds = (totalSeconds) => {
    if (totalSeconds <= 0 || !isFinite(totalSeconds)) return null;

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.round(totalSeconds % 60);

    const paddedMinutes = minutes.toString().padStart(2, '0');
    const paddedSeconds = seconds.toString().padStart(2, '0');

    if (hours > 0) {
        return `${hours}:${paddedMinutes}:${paddedSeconds}`;
    }
    return `${minutes}:${paddedSeconds}`;
};

const STANDARD_DISTANCES = ["5k", "10k", "1/2 Marathon", "Marathon"];

// --- Loading Spinner Component ---
function LoadingSpinner() {
    return (
        <div className="flex justify-center items-center min-h-screen">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-500"></div>
        </div>
    );
}

// --- Shareable Card Components ---
const CompletedRaceShareableCard = ({ race, isPR }) => (
    <div id={`shareable-completed-card-${race.id}`} className="bg-slate-50 border border-slate-200 p-8 rounded-lg w-[450px]">
        <div className="flex items-start gap-3">
             {isPR && <Award className="text-amber-500 flex-shrink-0 mt-1" size={24} />}
             <p className="font-bold text-2xl text-slate-800">{race.name}</p>
        </div>
        <div className="flex flex-col gap-4 mt-6 text-lg">
            <p className="text-slate-600 flex items-start"><Flag size={24} className="mr-4 text-indigo-500 flex-shrink-0 mt-0.5"/><span><strong>Distance:</strong><span className="ml-2 font-normal">{race.distance || 'N/A'}</span></span></p>
            <p className="text-indigo-600 font-semibold flex items-start"><Clock size={24} className="mr-4 flex-shrink-0 mt-0.5"/><span><strong>Time:</strong><span className="ml-2 font-normal">{race.time}</span></span></p>
            <p className="text-slate-600 flex items-start"><Gauge size={24} className="mr-4 text-indigo-500 flex-shrink-0 mt-0.5"/><span><strong>Pace:</strong><span className="ml-2 font-normal">{formatPace(race.time, race.distance)} / mi</span></span></p>
            <p className="text-slate-600 flex items-start"><Calendar size={24} className="mr-4 text-indigo-500 flex-shrink-0 mt-0.5"/><span><strong>Date:</strong><span className="ml-2 font-normal">{race.date ? new Date(race.date + 'T00:00:00').toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' }) : 'No Date'}</span></span></p>
        </div>
        {race.notes && (
            <div className="mt-6 pt-6 border-t border-slate-200">
                 <p className="text-base text-slate-500">{race.notes}</p>
            </div>
        )}
    </div>
);

const UpcomingRaceShareableCard = ({ race }) => (
    <div id={`shareable-upcoming-card-${race.id}`} className="bg-slate-50 border border-slate-200 p-8 rounded-lg w-[450px]">
        <p className="font-bold text-2xl text-slate-800">{race.name}</p>
        <p className="text-lg text-slate-500 mt-2 flex items-center"><Calendar size={20} className="inline mr-3 text-indigo-500 flex-shrink-0"/><span>{race.date ? new Date(race.date + 'T00:00:00').toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' }) : 'Date TBD'}</span></p>
        <div className="mt-6 pt-6 border-t border-slate-200 flex flex-col gap-4 text-lg">
            <p className="text-slate-600 flex items-start"><Flag size={24} className="mr-4 text-indigo-500 flex-shrink-0 mt-0.5"/><span><strong>Distance:</strong><span className="ml-2 font-normal">{race.distance || 'N/A'}</span></span></p>
            <p className="text-slate-600 flex items-start"><Target size={24} className="mr-4 text-indigo-500 flex-shrink-0 mt-0.5"/><span><strong>Goal:</strong><span className="ml-2 font-normal">{race.goalTime || 'N/A'}</span></span></p>
            {race.goalTime && <p className="text-slate-600 flex items-start"><Gauge size={24} className="mr-4 text-indigo-500 flex-shrink-0 mt-0.5"/><span><strong>Goal Pace:</strong><span className="ml-2 font-normal">{formatPace(race.goalTime, race.distance)} / mi</span></span></p>}
            {race.info && <p className="text-slate-600 flex items-start"><Info size={24} className="mr-4 text-indigo-500 flex-shrink-0 mt-0.5"/><span><strong>Info:</strong><span className="ml-2 font-normal">{race.info}</span></span></p>}
        </div>
    </div>
);


// --- Main App Component ---
export default function App() {
    // --- State Management ---
    const [currentUser, setCurrentUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    // Modal States
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [showSignUpModal, setShowSignUpModal] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [shareImageData, setShareImageData] = useState('');
    const [shareImageName, setShareImageName] = useState('');
    const [showCompleteModal, setShowCompleteModal] = useState(false);
    const [showPRModal, setShowPRModal] = useState(false);
    const [newPRData, setNewPRData] = useState(null);
    const [showGoalAchievedModal, setShowGoalAchievedModal] = useState(false);
    const [goalAchievedData, setGoalAchievedData] = useState(null);
    const [showSettings, setShowSettings] = useState(false);
    const settingsRef = useRef(null);
    const [showUpdateInfoModal, setShowUpdateInfoModal] = useState(false);

    // Form visibility states
    const [showHistoryForm, setShowHistoryForm] = useState(false);
    const [showUpcomingForm, setShowUpcomingForm] = useState(false);

    // Theme state
    const [isDarkMode, setIsDarkMode] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('theme') !== 'light';
        }
        return true;
    });

    // Notification State
    const [notificationMessage, setNotificationMessage] = useState('');
    const [showNotification, setShowNotification] = useState(false);

    // Share State
    const [raceToShare, setRaceToShare] = useState(null);

    // Complete Race State
    const [raceToComplete, setRaceToComplete] = useState(null);
    const [completionTime, setCompletionTime] = useState('');
    const [completionNotes, setCompletionNotes] = useState('');

    // Completed Races State
    const [completedRaces, setCompletedRaces] = useState([]);
    const [personalRecords, setPersonalRecords] = useState({});
    const [newRaceName, setNewRaceName] = useState('');
    const [newRaceTime, setNewRaceTime] = useState('');
    const [newRaceDate, setNewRaceDate] = useState('');
    const [newRaceLink, setNewRaceLink] = useState('');
    const [newRaceNotes, setNewRaceNotes] = useState('');
    const [newRaceDistance, setNewRaceDistance] = useState('5k');
    const [showCustomHistoryDistance, setShowCustomHistoryDistance] = useState(false);

    // Upcoming Races State
    const [upcomingRaces, setUpcomingRaces] = useState([]);
    const [newUpcomingRace, setNewUpcomingRace] = useState({ name: '', date: '', distance: '5k', goalTime: '', link: '', info: '' });
    const [showCustomUpcomingDistance, setShowCustomUpcomingDistance] = useState(false);

    const [editingUpcomingRaceId, setEditingUpcomingRaceId] = useState(null);
    const [editingUpcomingRaceData, setEditingUpcomingRaceData] = useState({ name: '', date: '', distance: '', goalTime: '', link: '', info: '' });
    const [showCustomEditDistance, setShowCustomEditDistance] = useState(false);

    // --- Effect to load external scripts ---
    useEffect(() => {
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
        script.async = true;
        document.body.appendChild(script);

        return () => {
            document.body.removeChild(script);
        };
    }, []);

    // --- Authentication Effect ---
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setCurrentUser(user);
                const userDocRef = doc(db, `artifacts/${appId}/users/${user.uid}/profile`, "data");
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) {
                    setUserProfile(userDocSnap.data());
                } else {
                     setUserProfile({ name: 'Runner', username: 'Runner' });
                }
            } else {
                setCurrentUser(null);
                setUserProfile(null);
                setCompletedRaces([]);
                setUpcomingRaces([]);
            }
            setIsAuthReady(true);
        });
        return () => unsubscribe();
    }, []);

    // --- Dark Mode Effect ---
    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }, [isDarkMode]);

    // --- Click outside settings menu handler ---
    useEffect(() => {
        function handleClickOutside(event) {
            if (settingsRef.current && !settingsRef.current.contains(event.target)) {
                setShowSettings(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [settingsRef]);

    // --- Personal Records Calculation Effect ---
    useEffect(() => {
        const calculatePRs = () => {
            if (completedRaces.length === 0) {
                setPersonalRecords({});
                return;
            }

            const allDistances = Array.from(new Set(completedRaces.map(r => r.distance)));
            const distancesToCalc = Array.from(new Set([...STANDARD_DISTANCES, ...allDistances]));

            const records = {};
            distancesToCalc.forEach(distance => {
                const relevantRaces = completedRaces.filter(race => race.distance === distance);

                if (relevantRaces.length > 0) {
                    const bestRace = relevantRaces.reduce((best, current) => {
                        return timeToSeconds(current.time) < timeToSeconds(best.time) ? current : best;
                    });
                    records[distance] = bestRace;
                }
            });
            setPersonalRecords(records);
        };

        calculatePRs();
    }, [completedRaces]);

    // --- Firestore Real-time Listeners ---
    useEffect(() => {
        if (currentUser) {
            const path = `artifacts/${appId}/users/${currentUser.uid}/completedRaces`;
            const completedRacesRef = collection(db, path);
            const q = query(completedRacesRef, orderBy('date', 'desc'));

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const races = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                setCompletedRaces(races);
            }, (error) => {
                console.error("Error fetching completed races:", error);
                showAndHideNotification("Could not load race history.");
            });

            return () => unsubscribe();
        }
    }, [currentUser]);

    useEffect(() => {
        if (currentUser) {
            const path = `artifacts/${appId}/users/${currentUser.uid}/upcomingRaces`;
            const upcomingRacesRef = collection(db, path);
            const q = query(upcomingRacesRef, orderBy('date', 'asc'));

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const races = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                setUpcomingRaces(races);
            }, (error) => {
                console.error("Error fetching upcoming races:", error);
                showAndHideNotification("Could not load upcoming races.");
            });

            return () => unsubscribe();
        }
    }, [currentUser]);

    // --- Image Generation Effect ---
    useEffect(() => {
        if (raceToShare) {
            setTimeout(() => {
                const cardId = `shareable-${raceToShare.type}-card-${raceToShare.data.id}`;
                const cardElement = document.getElementById(cardId);

                if (cardElement && typeof window.html2canvas === 'function') {
                    showAndHideNotification('Generating image preview...', 5000);
                    window.html2canvas(cardElement, {
                        scale: 2,
                        backgroundColor: '#f8fafc' // Force light background (slate-50) for image
                    }).then(canvas => {
                        setShareImageData(canvas.toDataURL('image/png'));
                        setShareImageName(`${raceToShare.data.name.replace(/ /g, '_')}.png`);
                        setShowShareModal(true);
                        showAndHideNotification('Preview ready!');
                    }).catch(err => {
                        console.error("html2canvas error:", err);
                        showAndHideNotification('Could not generate image.');
                    });
                } else {
                    showAndHideNotification('Error creating image.');
                }
                setRaceToShare(null); // Reset after attempting to render
            }, 100);
        }
    }, [raceToShare]);


    // --- General Handlers ---
    const showAndHideNotification = (message, duration = 3000) => {
        setNotificationMessage(message);
        setShowNotification(true);
        setTimeout(() => {
            setShowNotification(false);
        }, duration);
    };

    const handleInitiateShare = (race, type) => {
        const isPR = type === 'completed' && personalRecords[race.distance]?.id === race.id;
        setRaceToShare({ data: race, type, isPR });
    };

    const handleOpenCompleteModal = (race) => {
        setRaceToComplete(race);
        setShowCompleteModal(true);
    };

    const handleCompleteRace = async (e) => {
        e.preventDefault();
        if (!raceToComplete || !completionTime) {
            showAndHideNotification("Please enter a completion time.");
            return;
        }

        const completionSeconds = timeToSeconds(completionTime);
        const goalSeconds = timeToSeconds(raceToComplete.goalTime);
        const currentPR = personalRecords[raceToComplete.distance];

        const isNewPR = STANDARD_DISTANCES.includes(raceToComplete.distance) &&
                        (!currentPR || completionSeconds < timeToSeconds(currentPR?.time));

        const goalBeaten = goalSeconds > 0 && completionSeconds < goalSeconds;

        const newCompletedRace = {
            name: raceToComplete.name,
            distance: raceToComplete.distance,
            time: completionTime,
            date: raceToComplete.date,
            link: raceToComplete.link || '',
            notes: completionNotes
        };

        try {
            await addDoc(collection(db, `artifacts/${appId}/users/${currentUser.uid}/completedRaces`), newCompletedRace);
            await deleteDoc(doc(db, `artifacts/${appId}/users/${currentUser.uid}/upcomingRaces`, raceToComplete.id));

            setRaceToComplete(null);
            setCompletionTime('');
            setCompletionNotes('');
            setShowCompleteModal(false);

            if (isNewPR) {
                setNewPRData(newCompletedRace);
                setShowPRModal(true);
            } else if (goalBeaten) {
                setGoalAchievedData({ ...newCompletedRace, goalTime: raceToComplete.goalTime });
                setShowGoalAchievedModal(true);
            } else {
                showAndHideNotification("Race moved to history!");
            }
        } catch (error) {
            console.error("Error completing race:", error);
            showAndHideNotification("Error moving race to history.");
        }
    };

    const handleAddCompletedRace = (e) => {
        e.preventDefault();
        if (!newRaceName.trim() || !newRaceTime.trim() || !newRaceDate.trim() || !newRaceDistance.trim()) return;

        const currentPR = personalRecords[newRaceDistance];
        const newTimeInSeconds = timeToSeconds(newRaceTime);
        let isNewPR = false;
        if (STANDARD_DISTANCES.includes(newRaceDistance)) {
            if (!currentPR || newTimeInSeconds < timeToSeconds(currentPR?.time)) {
                isNewPR = true;
            }
        }

        const newRace = {
            name: newRaceName,
            time: newRaceTime,
            date: newRaceDate,
            link: newRaceLink,
            distance: newRaceDistance,
            notes: newRaceNotes
        };

        addDoc(collection(db, `artifacts/${appId}/users/${currentUser.uid}/completedRaces`), newRace)
            .then(() => {
                if (isNewPR) {
                    setNewPRData(newRace);
                    setShowPRModal(true);
                }
                setNewRaceName('');
                setNewRaceTime('');
                setNewRaceDate('');
                setNewRaceLink('');
                setNewRaceNotes('');
                setNewRaceDistance('5k');
                setShowCustomHistoryDistance(false);
                setShowHistoryForm(false);
            })
            .catch((error) => {
                console.error("Error adding completed race:", error);
                showAndHideNotification("Error adding race to history.");
            });
    };

    const handleDeleteRace = async (id, collectionName) => {
        try {
            await deleteDoc(doc(db, `artifacts/${appId}/users/${currentUser.uid}/${collectionName}`, id));
        } catch (error) {
            console.error("Error deleting race:", error);
            showAndHideNotification("Error deleting race.");
        }
    };

    const handleAddUpcomingRace = (e) => {
        e.preventDefault();
        if (!newUpcomingRace.name.trim() || !newUpcomingRace.date.trim()) return;

        const raceData = { ...newUpcomingRace };

        addDoc(collection(db, `artifacts/${appId}/users/${currentUser.uid}/upcomingRaces`), raceData)
            .then(() => {
                setNewUpcomingRace({ name: '', date: '', distance: '5k', goalTime: '', link: '', info: '' });
                setShowCustomUpcomingDistance(false);
                setShowUpcomingForm(false);
            })
            .catch((error) => {
                console.error("Error adding upcoming race:", error);
                showAndHideNotification("Error adding upcoming race.");
            });
    };

    const handleStartEditUpcomingRace = (race) => {
        setEditingUpcomingRaceId(race.id);
        setEditingUpcomingRaceData(race);
        setShowCustomEditDistance(!STANDARD_DISTANCES.includes(race.distance));
    };

    const handleSaveUpcomingRace = async (id) => {
        try {
            await updateDoc(doc(db, `artifacts/${appId}/users/${currentUser.uid}/upcomingRaces`, id), editingUpcomingRaceData);
            setEditingUpcomingRaceId(null);
        } catch(error){
            console.error("Error updating upcoming race:", error);
            showAndHideNotification("Error updating race.");
        }
    };

    const handleUpdateUserInfo = async (newName, newEmail) => {
        if (!currentUser) return;
        const profileRef = doc(db, `artifacts/${appId}/users/${currentUser.uid}/profile`, "data");
        try {
            await updateDoc(profileRef, { name: newName, email: newEmail });
            setUserProfile(prev => ({ ...prev, name: newName, email: newEmail }));
            setShowUpdateInfoModal(false);
            showAndHideNotification("Profile updated successfully!");
        } catch (error) {
            console.error("Error updating profile:", error);
            showAndHideNotification("Could not update profile.");
        }
    };

    const handleLogout = async () => {
        await signOut(auth);
    };

    const handleResetPassword = () => {
        setShowSettings(false);
        // Use the email from the Firebase auth object, not the Firestore profile
        const userEmail = currentUser?.email;
    
        if (!userEmail) {
            showAndHideNotification("No email on file to send reset link.", 4000);
            return;
        }
    
        sendPasswordResetEmail(auth, userEmail)
            .then(() => {
                showAndHideNotification(`Password reset link sent to ${userEmail}`);
            })
            .catch((error) => {
                console.error("Password reset error:", error);
                showAndHideNotification("Could not send password reset link.");
            });
    };

    // --- Render ---
    return (
        <div className={`bg-slate-50 dark:bg-gray-900 text-slate-800 dark:text-slate-200 min-h-screen font-sans antialiased`}>
            {showNotification && (
                <div className="fixed top-5 right-5 bg-green-500 text-white py-2 px-4 rounded-lg shadow-lg z-50">
                    {notificationMessage}
                </div>
            )}
            {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} onSwitch={() => { setShowLoginModal(false); setShowSignUpModal(true); }} />}
            {showSignUpModal && <SignUpModal onClose={() => setShowSignUpModal(false)} onSwitch={() => { setShowSignUpModal(false); setShowLoginModal(true); }} />}
            {showShareModal && (
                <ShareModal
                    race={raceToShare?.data}
                    type={raceToShare?.type}
                    imageData={shareImageData}
                    imageName={shareImageName}
                    onClose={() => { setShowShareModal(false); setRaceToShare(null); }}
                    onShareAsText={() => showAndHideNotification('Race details copied!')}
                />
            )}
            {showCompleteModal && (
                <CompleteRaceModal
                    race={raceToComplete}
                    time={completionTime}
                    setTime={setCompletionTime}
                    notes={completionNotes}
                    setNotes={setCompletionNotes}
                    onClose={() => setShowCompleteModal(false)}
                    onComplete={handleCompleteRace}
                />
            )}
            {showPRModal && <NewPRModal race={newPRData} onClose={() => { setShowPRModal(false); setNewPRData(null); }} />}
            {showGoalAchievedModal && <GoalAchievedModal race={goalAchievedData} onClose={() => { setShowGoalAchievedModal(false); setGoalAchievedData(null); }} />}
            {showUpdateInfoModal && (
                <UpdateInfoModal
                    userProfile={userProfile}
                    onClose={() => setShowUpdateInfoModal(false)}
                    onUpdate={handleUpdateUserInfo}
                />
            )}


            {/* Hidden container for generating shareable images */}
            <div className="absolute -left-full top-0">
                {raceToShare && raceToShare.type === 'completed' && <CompletedRaceShareableCard race={raceToShare.data} isPR={raceToShare.isPR} />}
                {raceToShare && raceToShare.type === 'upcoming' && <UpcomingRaceShareableCard race={raceToShare.data} />}
            </div>

            {!isAuthReady ? (
                <LoadingSpinner />
            ) : (
                <div className="container mx-auto p-4 sm:p-6 lg:p-8">
                    <header className="flex justify-between items-center mb-12">
                        <div className="flex items-center">
                            <img src="/logo.jpg" alt="Benedict Runs Logo" className="w-20 h-20 mr-4 rounded-lg" />
                            <div className="text-left">
                                <h1 className="text-4xl sm:text-5xl font-bold text-indigo-600 dark:text-indigo-400 tracking-tight">{userProfile?.name ? `${userProfile.name}'s` : "My"} Runs</h1>
                                <p className="text-slate-500 dark:text-slate-400 mt-2 text-lg">Your personal race tracking dashboard</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {currentUser ? (
                                <div className="relative" ref={settingsRef}>
                                    <button onClick={() => setShowSettings(s => !s)} className="flex items-center gap-2 text-slate-600 dark:text-slate-300 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800">
                                        <User size={18}/>
                                        <span className="font-semibold hidden sm:inline">{userProfile?.name}</span>
                                    </button>
                                    {showSettings && (
                                        <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl z-10 border border-slate-200 dark:border-gray-700">
                                            <div className="p-2">
                                                <button onClick={() => { setShowUpdateInfoModal(true); setShowSettings(false); }} className="w-full text-left px-3 py-2 text-sm rounded-md text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700">Update Info</button>
                                                <button onClick={handleResetPassword} className="w-full text-left px-3 py-2 text-sm rounded-md text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700">Reset Password</button>
                                                <div className="flex justify-between items-center px-3 py-2 text-sm text-slate-700 dark:text-slate-300">
                                                    <span>Dark Mode</span>
                                                    <button onClick={() => setIsDarkMode(!isDarkMode)} className={`w-10 h-5 rounded-full flex items-center p-0.5 transition-colors ${isDarkMode ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                                                        <span className={`w-4 h-4 rounded-full bg-white transform transition-transform ${isDarkMode ? 'translate-x-5' : 'translate-x-0'}`}></span>
                                                    </button>
                                                </div>
                                                <button onClick={handleLogout} className="w-full text-left px-3 py-2 text-sm rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10">Log Out</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <>
                                    <button onClick={() => setShowLoginModal(true)} className="font-semibold text-indigo-600 hover:text-indigo-800 py-2 px-4 rounded-lg">Log In</button>
                                    <button onClick={() => setShowSignUpModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center transition-all duration-300 shadow-sm hover:shadow-md">Sign Up</button>
                                </>
                            )}
                        </div>
                    </header>

                    {currentUser ? (
                        <>
                            <PersonalRecords records={personalRecords} />
                            <Stats completedRaces={completedRaces} />
                            <main className="grid grid-cols-1 lg:grid-cols-2 gap-10 mt-10">
                                {/* Race History Section */}
                                <section className="bg-white dark:bg-gray-800/50 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700">
                                    <div className="flex justify-between items-center mb-5">
                                        <h2 className="text-2xl font-bold flex items-center"><Flag className="mr-3 text-indigo-500 dark:text-indigo-400" />Race History</h2>
                                        {!showHistoryForm && (
                                            <button onClick={() => setShowHistoryForm(true)} className="bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 text-sm font-semibold px-3 py-1.5 rounded-lg flex items-center gap-2 hover:bg-indigo-200 dark:hover:bg-indigo-500/30">
                                                <Plus size={16} /> Add Race
                                            </button>
                                        )}
                                    </div>

                                    {showHistoryForm && (
                                        <form onSubmit={handleAddCompletedRace} className="mb-6 grid grid-cols-1 md:grid-cols-6 gap-4">
                                           <input type="text" value={newRaceName} onChange={(e) => setNewRaceName(e.target.value)} placeholder="Race Name" className="md:col-span-6 bg-slate-100 dark:bg-gray-700 dark:border-gray-600 text-inherit placeholder-slate-400 rounded-lg px-4 py-2.5 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>

                                           <div className={`grid gap-2 md:col-span-2 ${showCustomHistoryDistance ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                                <select value={showCustomHistoryDistance ? 'Custom' : newRaceDistance}
                                                    onChange={e => {
                                                        if (e.target.value === 'Custom') {
                                                            setShowCustomHistoryDistance(true);
                                                            setNewRaceDistance('');
                                                        } else {
                                                            setShowCustomHistoryDistance(false);
                                                            setNewRaceDistance(e.target.value);
                                                        }
                                                    }}
                                                    className="appearance-none w-full bg-slate-100 dark:bg-gray-700 dark:border-gray-600 text-inherit placeholder-slate-400 rounded-lg px-4 py-2.5 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                                    {STANDARD_DISTANCES.map(d => <option key={d} value={d}>{d}</option>)}
                                                    <option value="Custom">Custom</option>
                                                </select>
                                                {showCustomHistoryDistance && <input type="text" value={newRaceDistance} onChange={e => setNewRaceDistance(e.target.value)} placeholder="Custom" className="w-full bg-slate-100 dark:bg-gray-700 dark:border-gray-600 text-inherit placeholder-slate-400 rounded-lg px-4 py-2.5 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>}
                                           </div>

                                           <div className="md:col-span-2">
                                                <input type="text" value={newRaceTime} onChange={(e) => setNewRaceTime(e.target.value)} placeholder="Time (HH:MM:SS)" className="w-full bg-slate-100 dark:bg-gray-700 dark:border-gray-600 text-inherit placeholder-slate-400 rounded-lg px-4 py-2.5 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                                           </div>

                                            <input
                                                type="date"
                                                value={newRaceDate}
                                                onChange={(e) => setNewRaceDate(e.target.value)}
                                                className={`md:col-span-2 appearance-none w-full bg-slate-100 dark:bg-gray-700 dark:border-gray-600 rounded-lg px-4 py-2.5 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${!newRaceDate ? 'text-slate-400' : 'text-inherit'}`}
                                            />

                                           <div className="relative md:col-span-6">
                                                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18}/>
                                                <input type="url" value={newRaceLink} onChange={(e) => setNewRaceLink(e.target.value)} placeholder="Race Website Link (Optional)" className="w-full bg-slate-100 dark:bg-gray-700 dark:border-gray-600 text-inherit placeholder-slate-400 rounded-lg px-4 py-2.5 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 pl-10"/>
                                           </div>

                                           <textarea value={newRaceNotes} onChange={(e) => setNewRaceNotes(e.target.value)} placeholder="Notes (e.g., weather, how you felt)" className="md:col-span-6 bg-slate-100 dark:bg-gray-700 dark:border-gray-600 text-inherit placeholder-slate-400 rounded-lg px-4 py-2.5 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none h-20"/>

                                           <div className="md:col-span-6 flex justify-end gap-4">
                                                <button type="button" onClick={() => setShowHistoryForm(false)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 dark:bg-gray-600 dark:text-slate-200 dark:hover:bg-gray-500 font-semibold py-2 px-4 rounded-lg">Cancel</button>
                                                <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-lg flex items-center justify-center transition-all duration-300 shadow-sm hover:shadow-md"><Plus size={20} className="mr-2"/> Add To History</button>
                                           </div>
                                        </form>
                                    )}
                                    <div className="space-y-3 max-h-[32rem] overflow-y-auto pr-2">
                                       {completedRaces.length > 0 ? completedRaces.map(race => {
                                           const isPR = personalRecords[race.distance]?.id === race.id;
                                           return (
                                            <div id={`completed-card-${race.id}`} key={race.id} className="bg-slate-50 dark:bg-gray-700/50 border border-slate-200 dark:border-gray-700 p-4 rounded-lg flex justify-between items-center transition-all hover:shadow-md dark:hover:border-gray-600">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        {isPR && <Award className="text-amber-500 flex-shrink-0" size={18} />}
                                                        <p className="font-semibold text-slate-700 dark:text-slate-200 truncate">{race.name}</p>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm">
                                                        <p className="text-slate-500 dark:text-slate-400 flex items-center"><Flag size={14} className="mr-1.5"/>{race.distance || 'N/A'}</p>
                                                        <p className="text-indigo-600 dark:text-indigo-400 font-medium flex items-center"><Clock size={14} className="mr-1.5" />{race.time}</p>
                                                        <p className="text-slate-500 dark:text-slate-400 flex items-center"><Gauge size={14} className="mr-1.5"/>{formatPace(race.time, race.distance)}/mi</p>
                                                        <p className="text-slate-500 dark:text-slate-400 flex items-center"><Calendar size={14} className="mr-1.5"/>{race.date ? new Date(race.date + 'T00:00:00').toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' }) : 'No Date'}</p>
                                                    </div>
                                                    {race.notes && (
                                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 pt-2 border-t border-slate-200 dark:border-gray-600">
                                                            {race.notes}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                                                    <button onClick={() => handleInitiateShare(race, 'completed')} className="text-slate-400 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors p-2 rounded-full hover:bg-indigo-50 dark:hover:bg-gray-600"><Share2 size={18}/></button>
                                                    {race.link && <a href={race.link} target="_blank" rel="noopener noreferrer" className="text-slate-400 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors p-2 rounded-full hover:bg-indigo-50 dark:hover:bg-gray-600" aria-label="Race Website"><LinkIcon size={18}/></a>}
                                                    <button onClick={() => handleDeleteRace(race.id, 'completedRaces')} className="text-slate-400 dark:text-slate-400 hover:text-red-500 transition-colors p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-500/20" aria-label="Delete race"><Trash2 size={18}/></button>
                                                </div>
                                            </div>
                                           )}) : <p className="text-slate-400 dark:text-slate-500 text-center py-8">No completed races yet.</p>}
                                    </div>
                                </section>

                                {/* Upcoming Races Section */}
                                <section className="bg-white dark:bg-gray-800/50 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700">
                                    <div className="flex justify-between items-center mb-5">
                                         <h2 className="text-2xl font-bold flex items-center"><Calendar className="mr-3 text-indigo-500 dark:text-indigo-400" />Upcoming Races</h2>
                                         {!showUpcomingForm && (
                                            <button onClick={() => setShowUpcomingForm(true)} className="bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 text-sm font-semibold px-3 py-1.5 rounded-lg flex items-center gap-2 hover:bg-indigo-200 dark:hover:bg-indigo-500/30">
                                                <Plus size={16} /> Add Race
                                            </button>
                                        )}
                                     </div>
                                    {showUpcomingForm && (
                                         <form onSubmit={handleAddUpcomingRace} className="mb-6 grid grid-cols-1 md:grid-cols-6 gap-4">
                                              <input type="text" placeholder="Race Name" value={newUpcomingRace.name} onChange={(e) => setNewUpcomingRace({...newUpcomingRace, name: e.target.value})} className="md:col-span-6 bg-slate-100 dark:bg-gray-700 dark:border-gray-600 text-inherit placeholder-slate-400 rounded-lg px-4 py-2.5 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>

                                              <div className={`grid gap-2 md:col-span-2 ${showCustomUpcomingDistance ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                                   <select value={showCustomUpcomingDistance ? 'Custom' : newUpcomingRace.distance}
                                                         onChange={e => {
                                                             const val = e.target.value;
                                                             setShowCustomUpcomingDistance(val === 'Custom');
                                                             setNewUpcomingRace({...newUpcomingRace, distance: val === 'Custom' ? '' : val});
                                                         }}
                                                         className="appearance-none w-full bg-slate-100 dark:bg-gray-700 dark:border-gray-600 text-inherit placeholder-slate-400 rounded-lg px-4 py-2.5 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                                         {STANDARD_DISTANCES.map(d => <option key={d} value={d}>{d}</option>)}
                                                         <option value="Custom">Custom</option>
                                                   </select>
                                                   {showCustomUpcomingDistance && <input type="text" value={newUpcomingRace.distance} onChange={e => setNewUpcomingRace({...newUpcomingRace, distance: e.target.value})} placeholder="Custom" className="w-full bg-slate-100 dark:bg-gray-700 dark:border-gray-600 text-inherit placeholder-slate-400 rounded-lg px-4 py-2.5 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>}
                                              </div>
                                              <div className="md:col-span-2">
                                                 <input type="text" placeholder="Goal Time" value={newUpcomingRace.goalTime} onChange={(e) => setNewUpcomingRace({...newUpcomingRace, goalTime: e.target.value})} className="w-full bg-slate-100 dark:bg-gray-700 dark:border-gray-600 text-inherit placeholder-slate-400 rounded-lg px-4 py-2.5 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                                              </div>

                                             <input
                                                 type="date"
                                                 value={newUpcomingRace.date}
                                                 onChange={(e) => setNewUpcomingRace({...newUpcomingRace, date: e.target.value})}
                                                 className={`md:col-span-2 appearance-none w-full bg-slate-100 dark:bg-gray-700 dark:border-gray-600 rounded-lg px-4 py-2.5 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${!newUpcomingRace.date ? 'text-slate-400' : 'text-inherit'}`}
                                             />

                                              <div className="relative md:col-span-6">
                                                   <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18}/>
                                                   <input type="url" placeholder="Race Website Link (Optional)" value={newUpcomingRace.link} onChange={(e) => setNewUpcomingRace({...newUpcomingRace, link: e.target.value})} className="w-full bg-slate-100 dark:bg-gray-700 dark:border-gray-600 text-inherit placeholder-slate-400 rounded-lg px-4 py-2.5 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 pl-10"/>
                                              </div>

                                             <textarea placeholder="Related Info (e.g., location, registration link)" value={newUpcomingRace.info} onChange={(e) => setNewUpcomingRace({...newUpcomingRace, info: e.target.value})} className="md:col-span-6 bg-slate-100 dark:bg-gray-700 dark:border-gray-600 text-inherit placeholder-slate-400 rounded-lg px-4 py-2.5 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 h-20 resize-none"/>
                                              <div className="md:col-span-6 flex justify-end gap-4">
                                                 <button type="button" onClick={() => setShowUpcomingForm(false)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2 px-4 rounded-lg dark:bg-gray-600 dark:text-slate-200 dark:hover:bg-gray-500">Cancel</button>
                                                 <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-lg flex items-center justify-center transition-all duration-300 shadow-sm hover:shadow-md"><Plus size={20} className="mr-2"/> Add Upcoming Race</button>
                                              </div>
                                         </form>
                                    )}
                                     <div className="space-y-4 max-h-[32rem] overflow-y-auto pr-2">
                                         {upcomingRaces.length > 0 ? upcomingRaces.map(race => {
                                              const isPast = new Date(race.date + 'T00:00:00') < new Date();
                                              return (
                                                <div id={`upcoming-card-${race.id}`} key={race.id} className="bg-slate-50 dark:bg-gray-700/50 border border-slate-200 dark:border-gray-700 rounded-lg transition-all hover:shadow-md dark:hover:border-gray-600 overflow-hidden relative">
                                                    {isPast && !race.completed && (
                                                        <button onClick={() => handleOpenCompleteModal(race)} className="bg-green-100 dark:bg-green-800/20 text-green-800 dark:text-green-300 w-full p-2 flex items-center justify-center text-sm font-semibold hover:bg-green-200 dark:hover:bg-green-800/40 transition-colors">
                                                            Mark as complete?
                                                            <CheckSquare size={18} className="ml-2" />
                                                        </button>
                                                    )}
                                                    {editingUpcomingRaceId === race.id ? (
                                                        <div className="p-4 space-y-3">
                                                            <input type="text" value={editingUpcomingRaceData.name} onChange={(e) => setEditingUpcomingRaceData({...editingUpcomingRaceData, name: e.target.value})} className="w-full bg-slate-100 dark:bg-gray-700 dark:border-gray-600 text-inherit placeholder-slate-400 rounded-lg px-4 py-2.5 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                                                            <div className="grid grid-cols-6 gap-4">
                                                                <div className={`col-span-2 grid gap-4 ${showCustomEditDistance ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                                                    <select value={showCustomEditDistance ? 'Custom' : editingUpcomingRaceData.distance}
                                                                        onChange={e => {
                                                                            const val = e.target.value;
                                                                            setShowCustomEditDistance(val === 'Custom');
                                                                            setEditingUpcomingRaceData({...editingUpcomingRaceData, distance: val === 'Custom' ? '' : val});
                                                                        }}
                                                                        className="w-full appearance-none bg-slate-100 dark:bg-gray-700 dark:border-gray-600 text-inherit placeholder-slate-400 rounded-lg px-4 py-2.5 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                                                        {STANDARD_DISTANCES.map(d => <option key={d} value={d}>{d}</option>)}
                                                                        <option value="Custom">Custom</option>
                                                                    </select>
                                                                    {showCustomEditDistance && <input type="text" value={editingUpcomingRaceData.distance} onChange={e => setEditingUpcomingRaceData({...editingUpcomingRaceData, distance: e.target.value})} placeholder="Custom" className="w-full bg-slate-100 dark:bg-gray-700 dark:border-gray-600 text-inherit placeholder-slate-400 rounded-lg px-4 py-2.5 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>}
                                                                </div>
                                                                <div className="col-span-2">
                                                                    <input type="text" value={editingUpcomingRaceData.goalTime} onChange={(e) => setEditingUpcomingRaceData({...editingUpcomingRaceData, goalTime: e.target.value})} placeholder="Goal Time" className="w-full bg-slate-100 dark:bg-gray-700 dark:border-gray-600 text-inherit placeholder-slate-400 rounded-lg px-4 py-2.5 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                                                                </div>
                                                                <div className="relative col-span-2">
                                                                    <input
                                                                        type="date"
                                                                        value={editingUpcomingRaceData.date}
                                                                        onChange={(e) => setEditingUpcomingRaceData({...editingUpcomingRaceData, date: e.target.value})}
                                                                        className={`w-full appearance-none bg-slate-100 dark:bg-gray-700 dark:border-gray-600 rounded-lg px-4 py-2.5 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${!editingUpcomingRaceData.date ? 'text-slate-400' : 'text-inherit'}`}
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="relative">
                                                                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18}/>
                                                                <input type="url" placeholder="Race Website Link (Optional)" value={editingUpcomingRaceData.link} onChange={(e) => setEditingUpcomingRaceData({...editingUpcomingRaceData, link: e.target.value})} className="w-full bg-slate-100 dark:bg-gray-700 dark:border-gray-600 text-inherit placeholder-slate-400 rounded-lg px-4 py-2.5 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 pl-10"/>
                                                            </div>
                                                            <textarea value={editingUpcomingRaceData.info} onChange={(e) => setEditingUpcomingRaceData({...editingUpcomingRaceData, info: e.target.value})} className="w-full bg-slate-100 dark:bg-gray-700 dark:border-gray-600 text-inherit placeholder-slate-400 rounded-lg px-4 py-2.5 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 h-20 resize-none"/>
                                                            <div className="flex justify-end gap-2">
                                                                <button onClick={() => handleSaveUpcomingRace(race.id)} className="p-2 rounded-full text-white bg-green-500 hover:bg-green-600"><Save size={18}/></button>
                                                                <button onClick={() => setEditingUpcomingRaceId(null)} className="p-2 rounded-full text-slate-600 bg-slate-200 hover:bg-slate-300"><X size={18}/></button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="p-4">
                                                            <div className="flex justify-between items-start gap-4">
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="font-bold text-lg text-slate-800 dark:text-slate-100 truncate">{race.name}</p>
                                                                    <p className="sm:col-span-2 flex items-center text-sm text-slate-500 dark:text-slate-400 mt-1"><Calendar size={14} className="mr-2 text-indigo-500 dark:text-indigo-400"/>{race.date ? new Date(race.date + 'T00:00:00').toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' }) : 'Date TBD'}</p>
                                                                </div>
                                                                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                                                                    <button onClick={() => handleInitiateShare(race, 'upcoming')} className="text-slate-400 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors p-2 rounded-full hover:bg-indigo-50 dark:hover:bg-gray-600"><Share2 size={18}/></button>
                                                                    {race.link && <a href={race.link} target="_blank" rel="noopener noreferrer" className="text-slate-400 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors p-2 rounded-full hover:bg-indigo-50 dark:hover:bg-gray-600" aria-label="Race Website"><LinkIcon size={18}/></a>}
                                                                    <button onClick={() => handleStartEditUpcomingRace(race)} className="text-slate-400 dark:text-slate-400 hover:text-yellow-600 dark:hover:text-yellow-400 transition-colors p-2 rounded-full hover:bg-yellow-50 dark:hover:bg-yellow-500/20"><Edit size={18}/></button>
                                                                    <button onClick={() => handleDeleteRace(race.id, 'upcomingRaces')} className="text-slate-400 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-500/20"><Trash2 size={18}/></button>
                                                                </div>
                                                            </div>
                                                            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-gray-700 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-slate-600 dark:text-slate-300 text-sm">
                                                                <p className="flex items-center"><Flag size={16} className="mr-2 text-indigo-500 dark:text-indigo-400"/><strong>Distance:</strong><span className="ml-2">{race.distance || 'N/A'}</span></p>
                                                                <p className="flex items-center"><Target size={16} className="mr-2 text-indigo-500 dark:text-indigo-400"/><strong>Goal:</strong><span className="ml-2">{race.goalTime || 'N/A'}</span></p>
                                                                {race.goalTime && <p className="flex items-center"><Gauge size={16} className="mr-2 text-indigo-500 dark:text-indigo-400"/><strong>Goal Pace:</strong><span className="ml-2">{formatPace(race.goalTime, race.distance)}/mi</span></p>}
                                                                {race.info && <p className="col-span-full flex items-start mt-1"><Info size={16} className="mr-2 text-indigo-500 dark:text-indigo-400 mt-0.5 flex-shrink-0"/><strong>Info:</strong><span className="ml-2">{race.info}</span></p>}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                              )}) : <p className="text-slate-400 dark:text-slate-500 text-center py-8">No upcoming races planned.</p>}
                                     </div>
                                </section>
                            </main>
                        </>
                    ) : (
                        <div className="text-center py-20">
                            <h2 className="text-2xl font-bold text-slate-700">Welcome to Benedict Runs!</h2>
                            <p className="text-slate-500 mt-2">Please log in or sign up to track your races.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// --- Personal Records Component ---
function PersonalRecords({ records }) {
    const prDistances = useMemo(() => {
        const customDistances = Object.keys(records).filter(d => !STANDARD_DISTANCES.includes(d));
        return [...STANDARD_DISTANCES, ...customDistances];
    }, [records]);

    return (
        <section className="bg-white dark:bg-gray-800/50 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700">
            <h2 className="text-2xl font-bold mb-5 flex items-center">
                <Award className="mr-3 text-amber-500" />Personal Records
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {prDistances.map(distance => {
                    const record = records[distance];
                    return (
                        <div key={distance} className="bg-slate-50 dark:bg-gray-700/50 border border-slate-200 dark:border-gray-700 p-4 rounded-lg">
                            <h3 className="font-bold text-indigo-600 dark:text-indigo-400">{distance}</h3>
                            {record ? (
                                <div className="mt-2 flex justify-between items-start text-sm">
                                    <div>
                                        <p className="font-semibold text-2xl text-slate-700 dark:text-slate-200">{record.time}</p>
                                        <p className="text-slate-500 dark:text-slate-400 flex items-center mt-1">
                                            <Gauge size={14} className="mr-1.5 flex-shrink-0" />
                                            <span>{formatPace(record.time, record.distance)} / mi</span>
                                        </p>
                                    </div>
                                    <div className="text-right flex-shrink-0 pl-2">
                                        <p className="font-semibold text-slate-600 dark:text-slate-300 truncate" title={record.name}>{record.name}</p>
                                        <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">{record.date ? new Date(record.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : ''}</p>
                                    </div>
                                </div>
                            ) : (
                                <p className="mt-2 text-slate-400 dark:text-slate-500">No record set.</p>
                            )}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

// --- Stats Component ---
function Stats({ completedRaces }) {
    const [selectedYear, setSelectedYear] = useState('All');
    const [openDistance, setOpenDistance] = useState(null);
    const [isExpanded, setIsExpanded] = useState(false);

    const toggleExpansion = () => setIsExpanded(prev => !prev);

    const handleToggleAccordion = (distance) => {
        setOpenDistance(prev => prev === distance ? null : distance);
    };

    const availableYears = useMemo(() => {
        if (!completedRaces || completedRaces.length === 0) return [];
        const years = new Set(completedRaces.map(race => new Date(race.date + 'T00:00:00').getFullYear()));
        return Array.from(years).sort((a, b) => b - a);
    }, [completedRaces]);

    const yearStats = useMemo(() => {
        const filteredRaces = selectedYear === 'All'
            ? completedRaces
            : completedRaces.filter(race => new Date(race.date + 'T00:00:00').getFullYear() === Number(selectedYear));

        let totalMiles = 0;
        let totalTimeInSeconds = 0;
        filteredRaces.forEach(race => {
            try {
                const miles = distanceToMiles(race.distance);
                const seconds = timeToSeconds(race.time);
                if (typeof miles === 'number' && !isNaN(miles)) {
                    totalMiles += miles;
                }
                if (typeof seconds === 'number' && !isNaN(seconds)) {
                    totalTimeInSeconds += seconds;
                }
            } catch (error) {
                console.error("Could not parse race data:", race, error);
            }
        });

        const racesByDistance = filteredRaces.reduce((acc, race) => {
            const distance = race.distance || 'N/A';
            if (!acc[distance]) {
                acc[distance] = [];
            }
            acc[distance].push(race);
            return acc;
        }, {});

        const distanceStats = {};
        const uniqueDistances = Array.from(new Set(filteredRaces.map(r => r.distance)));
        const distancesForStats = Array.from(new Set([...STANDARD_DISTANCES, ...uniqueDistances]));

        distancesForStats.forEach(distance => {
            const relevantRaces = filteredRaces.filter(r => r.distance === distance);

            if (relevantRaces.length > 0) {
                const sortedByTime = [...relevantRaces].sort((a, b) => timeToSeconds(a.time) - timeToSeconds(b.time));
                const bestRace = sortedByTime[0];
                let improvement = null;

                if (relevantRaces.length > 1) {
                    const worstRace = sortedByTime[sortedByTime.length - 1];
                    const improvementInSeconds = timeToSeconds(worstRace.time) - timeToSeconds(bestRace.time);
                    if (improvementInSeconds > 0) {
                        improvement = formatSeconds(improvementInSeconds);
                    }
                }

                distanceStats[distance] = { bestTime: bestRace.time, distance: bestRace.distance, improvement };
            } else if (STANDARD_DISTANCES.includes(distance)) {
                 distanceStats[distance] = { bestTime: 'N/A', distance: null, improvement: null };
            }
        });

        for (const distance in racesByDistance) {
            racesByDistance[distance].sort((a, b) => new Date(b.date) - new Date(a.date));
        }

        return {
            racesByDistance: Object.entries(racesByDistance).sort((a,b) => b[1].length - a[1].length),
            distanceStats,
            totalRaces: filteredRaces.length,
            totalMiles: totalMiles.toFixed(2),
            totalTime: formatSeconds(totalTimeInSeconds)
        };

    }, [completedRaces, selectedYear]);

    if (completedRaces.length === 0) {
        return null;
    }

    return (
        <section className="bg-white dark:bg-gray-800/50 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 mt-10">
            <div className="flex justify-between items-center">
                 <button onClick={toggleExpansion} className="flex items-center gap-3 text-2xl font-bold p-2 -m-2 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-700/50">
                    <BarChart2 className="text-indigo-500 dark:text-indigo-400" />
                    <span>Stats</span>
                    <ChevronDown className={`transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} size={24} />
                </button>
                <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="bg-slate-100 dark:bg-gray-700 dark:border-gray-600 text-inherit rounded-lg px-4 py-2 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                    <option value="All">All Time</option>
                    {availableYears.map(year => <option key={year} value={year}>{year}</option>)}
                </select>
            </div>

            {isExpanded && (
                <div className="mt-6">
                    {yearStats.totalRaces > 0 ? (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                                <div className="bg-slate-50 dark:bg-gray-700/50 p-4 rounded-lg text-center">
                                    <div className="flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                                        <Flag size={16} />
                                        <span>Total Races</span>
                                    </div>
                                    <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{yearStats.totalRaces}</p>
                                </div>
                                <div className="bg-slate-50 dark:bg-gray-700/50 p-4 rounded-lg text-center">
                                    <div className="flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                                        <Milestone size={16} />
                                        <span>Total Miles</span>
                                    </div>
                                    <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{yearStats.totalMiles}</p>
                                </div>
                                <div className="bg-slate-50 dark:bg-gray-700/50 p-4 rounded-lg text-center">
                                    <div className="flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                                        <Clock size={16} />
                                        <span>Total Time</span>
                                    </div>
                                    <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{yearStats.totalTime || '0:00'}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Left Column: Accordion List */}
                                <div className="space-y-2">
                                    {yearStats.racesByDistance.map(([distance, races]) => (
                                        <div key={distance} className="border-b border-slate-200 dark:border-gray-700 last:border-b-0">
                                            <button onClick={() => handleToggleAccordion(distance)} className="w-full flex justify-between items-center p-3 hover:bg-slate-50 dark:hover:bg-gray-700/50 rounded-lg">
                                                <span className="font-bold">{distance}</span>
                                                <div className="flex items-center gap-4">
                                                    <span className="text-sm text-slate-500 dark:text-slate-400">{races.length} race{races.length > 1 ? 's' : ''}</span>
                                                    <ChevronDown className={`transform transition-transform duration-200 ${openDistance === distance ? 'rotate-180' : ''}`} size={20} />
                                                </div>
                                            </button>
                                            {openDistance === distance && (
                                                <div className="pl-4 pr-2 pt-2 pb-4">
                                                    {selectedYear !== 'All' && races.length > 1 && (
                                                        <div className="mb-4">
                                                            <h4 className="text-sm font-bold text-center mb-2">Time Progression in {selectedYear}</h4>
                                                            <TimeProgressChart data={races} />
                                                        </div>
                                                    )}
                                                    <ul className="space-y-2">
                                                        {races.map(race => (
                                                            <li key={race.id} className="flex justify-between items-center text-sm p-2 bg-slate-100 dark:bg-gray-700 rounded-md">
                                                                <div>
                                                                    <p className="font-semibold">{race.name}</p>
                                                                    <p className="text-xs text-slate-400">{new Date(race.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                                                                </div>
                                                                <div className="text-right">
                                                                    <p className="font-mono">{race.time}</p>
                                                                    <p className="font-mono text-xs text-slate-400">{formatPace(race.time, race.distance)}/mi</p>
                                                                </div>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Right Column: Year Best Grid */}
                                <div>
                                    <h3 className="font-bold mb-3 text-lg text-center">Best Times in {selectedYear === 'All' ? 'All Time' : selectedYear}</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {Object.entries(yearStats.distanceStats).map(([distance, record]) => {
                                            if(record.bestTime === 'N/A' && !STANDARD_DISTANCES.includes(distance)) return null;
                                            return (
                                            <div key={distance} className="bg-slate-50 dark:bg-gray-700/50 p-4 rounded-lg text-center flex flex-col justify-between">
                                                <div>
                                                    <h4 className="font-bold text-indigo-600 dark:text-indigo-400">{distance}</h4>
                                                    <p className="text-2xl font-semibold mt-2">{record.bestTime}</p>
                                                    {record.bestTime !== 'N/A' && (
                                                        <p className="text-slate-500 dark:text-slate-400 text-sm">
                                                            {formatPace(record.bestTime, record.distance)} / mi
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="h-7 mt-2 flex flex-col justify-center">
                                                    {record.improvement && (
                                                        <div className="flex items-center justify-center gap-1 text-xs">
                                                            <span className="text-slate-500 dark:text-slate-400">Improvement:</span>
                                                            <span className="font-semibold text-green-500 flex items-center gap-1">
                                                                <TrendingDown size={14} />
                                                                {record.improvement}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            )})}
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <p className="text-slate-400 dark:text-slate-500 text-center py-8">No races completed in {selectedYear}.</p>
                    )}
                </div>
            )}
        </section>
    );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white dark:bg-gray-800 p-2 border border-slate-200 dark:border-gray-600 rounded-lg shadow-lg text-sm">
        <p className="font-bold">{data.name}</p>
        <p className="text-slate-500 dark:text-slate-400">{`Date: ${label}`}</p>
        <p className="text-indigo-600 dark:text-indigo-400">{`Time: ${data.time}`}</p>
      </div>
    );
  }

  return null;
};

function TimeProgressChart({ data }) {
    const chartData = useMemo(() => {
        return data
            .map(race => ({
                ...race,
                dateObj: new Date(race.date + 'T00:00:00'),
                timeInSeconds: timeToSeconds(race.time)
            }))
            .filter(race => race.dateObj.toString() !== 'Invalid Date' && race.timeInSeconds > 0)
            .sort((a,b) => a.dateObj - b.dateObj)
            .map(race => ({
                ...race,
                // Format date for the axis label after sorting
                formattedDate: race.dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            }));
    }, [data]);

    return (
        <div className="w-full h-60">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart
                    data={chartData}
                    margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
                >
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                    <XAxis dataKey="formattedDate" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis
                        domain={['dataMin - 60', 'dataMax + 60']}
                        allowDecimals={false}
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => formatSeconds(value)}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="timeInSeconds" stroke="#4f46e5" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 8 }}/>
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

// --- Authentication Modals ---
function NewPRModal({ race, onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md m-4 text-center">
        <Award className="text-amber-500 mx-auto animate-pulse" size={80} />
        <h2 className="text-3xl font-bold mt-4 text-slate-800">New Personal Record!</h2>
        {race && (
            <div className="text-slate-600 mt-4 text-lg">
                <p className="font-semibold">{race.name}</p>
                <p>{race.distance} - <span className="font-bold text-indigo-600">{race.time}</span></p>
                <p className="text-base mt-1">({formatPace(race.time, race.distance)} / mi)</p>
            </div>
        )}
        <button onClick={onClose} className="mt-6 w-full bg-indigo-600 text-white p-3 rounded-lg font-bold hover:bg-indigo-700">
            Awesome!
        </button>
      </div>
    </div>
  );
}

function GoalAchievedModal({ race, onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md m-4 text-center">
        <PartyPopper className="text-indigo-500 mx-auto animate-bounce" size={80} />
        <h2 className="text-3xl font-bold mt-4 text-slate-800">Goal Achieved!</h2>
        {race && (
            <div className="text-slate-600 mt-4 text-lg">
                <p className="font-semibold">{race.name}</p>
                <p>
                    <span className="text-sm">Goal: </span>
                    <span className="line-through">{race.goalTime}</span>
                    <span className="text-sm ml-4">You Ran: </span>
                    <span className="font-bold text-indigo-600">{race.time}</span>
                </p>
            </div>
        )}
        <button onClick={onClose} className="mt-6 w-full bg-indigo-600 text-white p-3 rounded-lg font-bold hover:bg-indigo-700">
            Way to go!
        </button>
      </div>
    </div>
  );
}

function ShareModal({ race, type, imageData, imageName, onClose, onShareAsText }) {
    const handleDownload = () => {
        const link = document.createElement('a');
        link.download = imageName;
        link.href = imageData;
        link.click();
        onClose();
    };

    const handleTextShare = () => {
        let shareText = '';
        if (type === 'completed') {
            shareText = `Check out this race I ran!\nRace: ${race.name}\nDistance: ${race.distance}\nTime: ${race.time}\nDate: ${new Date(race.date + 'T00:00:00').toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' })}`;
        } else { // upcoming
            shareText = `I'm running this race soon!\nRace: ${race.name}\nDistance: ${race.distance}\nGoal Time: ${race.goalTime}\nDate: ${new Date(race.date + 'T00:00:00').toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' })}`;
        }

        const textArea = document.createElement("textarea");
        textArea.value = shareText;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            onShareAsText();
        } catch (err) {
            console.error('Failed to copy: ', err);
        }
        document.body.removeChild(textArea);
        onClose();
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-2xl w-full max-w-lg m-4">
                <h2 className="text-2xl font-bold mb-4 dark:text-slate-100">Share Race</h2>
                <div className="my-4 border border-slate-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <img src={imageData} alt="Race card preview" className="w-full h-auto" />
                </div>
                <div className="flex justify-end gap-4">
                    <button onClick={onClose} className="bg-slate-200 text-slate-700 p-3 rounded-lg font-bold hover:bg-slate-300 dark:bg-gray-600 dark:text-slate-200 dark:hover:bg-gray-500">
                        Cancel
                    </button>
                    <button onClick={handleTextShare} className="bg-slate-500 text-white p-3 rounded-lg font-bold hover:bg-slate-600 flex items-center gap-2">
                        <ClipboardCopy size={18}/> Copy Text
                    </button>
                    <button onClick={handleDownload} className="bg-indigo-600 text-white p-3 rounded-lg font-bold hover:bg-indigo-700 flex items-center gap-2">
                        <Download size={18}/> Download Image
                    </button>
                </div>
            </div>
        </div>
    );
}

function SignUpModal({ onClose, onSwitch }) {
    // Remove the username state, we'll use email for login
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [email, setEmail] = useState(''); // This will now be the primary identifier
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSignUp = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        // All fields are now required
        if (!email || !password || !name) {
            setError("Name, email, and password are required.");
            setLoading(false);
            return;
        }

        try {
            // Use the real email to create the user in Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            onClose(); // Close modal immediately

            // Save the user's display name and email in their Firestore profile
            await setDoc(doc(db, `artifacts/${appId}/users/${user.uid}/profile`, "data"), {
                name: name,
                email: email, // Store for display and other purposes
                createdAt: new Date(),
            });

        } catch (authError) {
            if (authError.code === 'auth/email-already-in-use') {
                setError("This email is already in use. Please try another or log in.");
            } else if (authError.code === 'auth/invalid-email') {
                setError("Please enter a valid email address.");
            }
            else {
                setError("An error occurred during sign-up. Please try again.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md m-4">
                <h2 className="text-2xl font-bold mb-4 dark:text-slate-100">Create Account</h2>
                {error && <p className="bg-red-100 text-red-700 p-3 rounded-lg mb-4">{error}</p>}
                <form onSubmit={handleSignUp} className="space-y-4">
                    {/* Switch the order to prioritize email */}
                    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your Name" required className="w-full bg-slate-100 dark:bg-gray-700 dark:text-white dark:placeholder-slate-400 dark:border-gray-600 p-3 rounded-lg border-slate-300"/>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required className="w-full bg-slate-100 dark:bg-gray-700 dark:text-white dark:placeholder-slate-400 dark:border-gray-600 p-3 rounded-lg border-slate-300"/>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (min. 6 characters)" required className="w-full bg-slate-100 dark:bg-gray-700 dark:text-white dark:placeholder-slate-400 dark:border-gray-600 p-3 rounded-lg border-slate-300"/>
                    <div className="flex justify-between items-center gap-4">
                        <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white p-3 rounded-lg font-bold hover:bg-indigo-700 disabled:bg-indigo-300">{loading ? 'Creating...' : 'Sign Up'}</button>
                        <button type="button" onClick={onClose} className="w-full bg-slate-200 text-slate-700 p-3 rounded-lg font-bold hover:bg-slate-300 dark:bg-gray-600 dark:text-slate-200 dark:hover:bg-gray-500">Cancel</button>
                    </div>
                </form>
                <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
                    Already have an account? <button onClick={onSwitch} className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">Log In</button>
                </p>
            </div>
        </div>
    );
}

function LoginModal({ onClose, onSwitch }) {
    const [email, setEmail] = useState(''); // Changed from username to email
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // Use the real email and password to sign in
            await signInWithEmailAndPassword(auth, email, password);
            onClose();
        } catch (authError) {
             switch (authError.code) {
                case 'auth/user-not-found':
                case 'auth/wrong-password':
                case 'auth/invalid-credential':
                    setError('Invalid email or password.');
                    break;
                default:
                    setError('An error occurred. Please try again.');
                    break;
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md m-4">
                <h2 className="text-2xl font-bold mb-4 dark:text-slate-100">Log In</h2>
                {error && <p className="bg-red-100 text-red-700 p-3 rounded-lg mb-4">{error}</p>}
                <form onSubmit={handleLogin} className="space-y-4">
                    {/* This input now accepts an email address */}
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required className="w-full bg-slate-100 dark:bg-gray-700 dark:text-white dark:placeholder-slate-400 dark:border-gray-600 p-3 rounded-lg border-slate-300"/>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required className="w-full bg-slate-100 dark:bg-gray-700 dark:text-white dark:placeholder-slate-400 dark:border-gray-600 p-3 rounded-lg border-slate-300"/>
                    <div className="flex justify-between items-center gap-4">
                         <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white p-3 rounded-lg font-bold hover:bg-indigo-700 disabled:bg-indigo-300">{loading ? 'Logging in...' : 'Log In'}</button>
                        <button type="button" onClick={onClose} className="w-full bg-slate-200 text-slate-700 p-3 rounded-lg font-bold hover:bg-slate-300 dark:bg-gray-600 dark:text-slate-200 dark:hover:bg-gray-500">Cancel</button>
                    </div>
                </form>
                 <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
                    Don't have an account? <button onClick={onSwitch} className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">Sign Up</button>
                </p>
            </div>
        </div>
    );
}

function CompleteRaceModal({ race, time, setTime, notes, setNotes, onClose, onComplete }) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <form onSubmit={onComplete} className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md m-4">
                <h2 className="text-2xl font-bold mb-2 dark:text-slate-100">Complete Race</h2>
                <p className="text-slate-500 dark:text-slate-400 mb-4 text-lg">{race.name}</p>
                <div className="space-y-4">
                     <input type="text" value={time} onChange={(e) => setTime(e.target.value)} placeholder="Completion Time (e.g., 45:32)" required className="w-full bg-slate-100 dark:bg-gray-700 dark:text-white dark:placeholder-slate-400 dark:border-gray-600 p-3 rounded-lg border-slate-300"/>
                     <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (e.g., weather, how you felt)" className="w-full bg-slate-100 dark:bg-gray-700 dark:text-white dark:placeholder-slate-400 dark:border-gray-600 p-3 rounded-lg border-slate-300 h-24 resize-none" />
                </div>
                <div className="flex justify-end gap-4 mt-6">
                    <button type="button" onClick={onClose} className="bg-slate-200 text-slate-700 p-3 rounded-lg font-bold hover:bg-slate-300 dark:bg-gray-600 dark:text-slate-200 dark:hover:bg-gray-500">
                        Cancel
                    </button>
                    <button type="submit" className="bg-indigo-600 text-white p-3 rounded-lg font-bold hover:bg-indigo-700">
                        Add to History
                    </button>
                </div>
            </form>
        </div>
    );
}

function UpdateInfoModal({ userProfile, onClose, onUpdate }) {
    const [name, setName] = useState(userProfile?.name || '');
    const [email, setEmail] = useState(userProfile?.email || '');

    const handleSubmit = (e) => {
        e.preventDefault();
        onUpdate(name, email);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md m-4">
                <h2 className="text-2xl font-bold mb-4 dark:text-slate-100">Update Your Info</h2>
                <div className="space-y-4">
                    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your Name" required className="w-full bg-slate-100 dark:bg-gray-700 dark:border-gray-600 dark:text-white p-3 rounded-lg border-slate-300"/>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email (Optional, for backup)" className="w-full bg-slate-100 dark:bg-gray-700 dark:border-gray-600 dark:text-white p-3 rounded-lg border-slate-300"/>
                </div>
                <div className="flex justify-end gap-4 mt-6">
                    <button type="button" onClick={onClose} className="bg-slate-200 text-slate-700 p-3 rounded-lg font-bold hover:bg-slate-300 dark:bg-gray-600 dark:text-slate-200 dark:hover:bg-gray-500">
                        Cancel
                    </button>
                    <button type="submit" className="bg-indigo-600 text-white p-3 rounded-lg font-bold hover:bg-indigo-700">
                        Save Changes
                    </button>
                </div>
            </form>
        </div>
    );
}
