import { usePatient } from '@openmrs/esm-framework';
import { getPatientEnrolledPrograms } from '../api/api';
import { useActivePatientEnrollment } from '@openmrs/esm-patient-common-lib';

function calculateAge(birthDate: Date): number {
  const today = new Date();
  const yearsDiff = today.getFullYear() - birthDate.getFullYear();
  if (
    today.getMonth() < birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())
  ) {
    // subtract one year if the current date is before the birth date this year
    return yearsDiff - 1;
  } else {
    return yearsDiff;
  }
}

const patientGenderMap = {
  female: 'F',
  male: 'M',
  other: 'O',
  unknown: 'U',
};

export const usePatientData = (patientUuid) => {
  const { patient, isLoading: isLoadingPatient, error: patientError } = usePatient(patientUuid);
  const { isLoading: isLoadingPatientPrograms, error: patientProgramsError, activePatientEnrollment } = useActivePatientEnrollment(patientUuid);

  if (patient && !isLoadingPatient && !isLoadingPatientPrograms) {
    // This is to support backward compatibility with the AMPATH JSON format
    patient['age'] = calculateAge(new Date(patient?.birthDate));
    patient['sex'] = patientGenderMap[patient.gender] ?? 'U';
    patient['patientPrograms'] =  activePatientEnrollment;
  }

  return { patient, isLoadingPatient, patientError };
};
