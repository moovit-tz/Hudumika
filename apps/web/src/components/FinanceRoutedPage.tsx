import React from 'react';
import {useLocation} from 'react-router-dom';
export function FinanceRoutedPage({children}:{children:React.ReactElement}){const location=useLocation();return React.cloneElement(children,{key:location.pathname});}
