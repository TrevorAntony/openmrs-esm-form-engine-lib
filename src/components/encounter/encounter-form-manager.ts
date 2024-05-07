import { type OpenmrsResource } from '@openmrs/esm-framework';
import {
  type PatientProgram,
  type FormField,
  type OpenmrsEncounter,
  type OpenmrsObs,
  type PatientIdentifier,
  type ProgramEnrollmentPayload,
} from '../../types';
import { type EncounterContext } from '../../form-context';
import { hasRendering, hasSubmission } from '../../utils/common-utils';
import { voidObs, constructObs } from '../../submission-handlers/obsHandler';
import { saveAttachment, saveEncounter, savePatientIdentifier, saveProgramEnrollment } from '../../api/api';
import dayjs from 'dayjs';

export class EncounterFormManager {
  static preparePatientIdentifiers(fields: FormField[], encounterLocation: string): PatientIdentifier[] {
    return fields
      .filter((field) => field.type === 'patientIdentifier' && hasSubmission(field))
      .map((field) => field.meta.submission.newValue);
  }

  static prepareEncounter(
    allFields: FormField[],
    encounterContext: EncounterContext,
    encounterRole: OpenmrsResource,
    visit: OpenmrsResource,
    encounterType: string,
    formUuid: string,
  ) {
    const { patient, encounter, encounterDate, encounterProvider, location } = encounterContext;
    const obsForSubmission = [];
    prepareObs(obsForSubmission, allFields);
    const ordersForSubmission = prepareOrders(allFields);
    let encounterForSubmission: OpenmrsEncounter = {};

    if (encounterContext.encounter) {
      Object.assign(encounterForSubmission, encounter);
      encounterForSubmission.location = location.uuid;
      // update encounter providers
      const hasCurrentProvider =
        encounterForSubmission.encounterProviders.findIndex(
          (encProvider) => encProvider.provider.uuid == encounterProvider,
        ) !== -1;
      if (!hasCurrentProvider) {
        encounterForSubmission.encounterProviders = [
          ...encounterForSubmission.encounterProviders,
          {
            provider: encounterProvider,
            encounterRole: encounterRole?.uuid,
          },
        ];
        encounterForSubmission.form = {
          uuid: formUuid,
        };
        encounterForSubmission['visit'] = {
          uuid: visit?.uuid,
        };
      }
      encounterForSubmission.obs = obsForSubmission;
      encounterForSubmission.orders = ordersForSubmission;
    } else {
      encounterForSubmission = {
        patient: patient.id,
        encounterDatetime: encounterDate,
        location: location.uuid,
        encounterType: encounterType,
        encounterProviders: [
          {
            provider: encounterProvider,
            encounterRole: encounterRole?.uuid,
          },
        ],
        obs: obsForSubmission,
        form: {
          uuid: formUuid,
        },
        visit: visit?.uuid,
        orders: ordersForSubmission,
      };
    }
    return encounterForSubmission;
  }

  static prepareProgramEnrollment(
    fields: FormField[],
    encounterLocation: string,
    patient: fhir.Patient,
    encounterContext: EncounterContext,
  ) {
    const patientProgramState = fields.filter((field) => field.type === 'programState').map((field) => field?.meta?.submission?.newValue);
    const completionDate = fields.find((field) => field.questionOptions.isProgramCompletion === true)?.value;
    const programUuid = encounterContext.programUuid;

    return {
      patient: patient.id,
      program: programUuid as unknown as string,
      states: patientProgramState,
      dateEnrolled: dayjs(completionDate).format(),
      location: encounterLocation,
    };
  }

  static saveEncounter(encounter: OpenmrsEncounter, abortController: AbortController) {
    return saveEncounter(abortController, encounter, encounter?.uuid);
  }

  static saveAttachments(fields: FormField[], encounter: OpenmrsEncounter, abortController: AbortController) {
    const complexFields = fields?.filter((field) => field?.questionOptions.rendering === 'file');
    return complexFields.map((field) => {
      const patientUuid = typeof encounter?.patient === 'string' ? encounter?.patient : encounter?.patient?.uuid;
      return saveAttachment(
        patientUuid,
        field,
        field?.questionOptions.concept,
        new Date().toISOString(),
        encounter?.uuid,
        abortController,
      );
    });
  }

  static savePatientIdentifiers(patient: fhir.Patient, identifiers: PatientIdentifier[]) {
    return identifiers.map((patientIdentifier) => {
      return savePatientIdentifier(patientIdentifier, patient.id);
    });
  }

  static saveProgramEnrollments = (
    programPayload: ProgramEnrollmentPayload,
    sessionMode: string,
    patientPrograms: Array<PatientProgram>,
  ) => {
    const ac = new AbortController();
    if (programPayload.program) {
      const patientProgramEnrollment = patientPrograms.find(
        (enrollment) => enrollment.program.uuid === programPayload.program && enrollment.dateCompleted === null,
      );

      // return already enrolled if not edit mode
      if (sessionMode == 'edit' && patientProgramEnrollment?.uuid) {
        let previousPatientProgramEnrollment;
        let currentPatientEnrollment;

        // end previous and update new
        if (!programPayload.dateEnrolled) {
          programPayload.dateEnrolled = patientProgramEnrollment?.dateEnrolled;
        }
        previousPatientProgramEnrollment = programPayload;
        previousPatientProgramEnrollment.uuid = patientProgramEnrollment?.uuid;
        previousPatientProgramEnrollment.states[0].endDate = new Date().toISOString();
        return saveProgramEnrollment(previousPatientProgramEnrollment, ac)
          .then(() => {
            return saveProgramEnrollment(currentPatientEnrollment, ac);
          })
          .catch((error) => {
            return error;
          });
      } else if (sessionMode === 'enter' && patientProgramEnrollment?.uuid) {
        throw new Error('Patient enrolled into program');
      } else {
        return saveProgramEnrollment(programPayload, ac);
      }
    }
  };
}

// Helpers

function prepareObs(obsForSubmission: OpenmrsObs[], fields: FormField[]) {
  fields
    .filter((field) => hasSubmitableObs(field))
    .forEach((field) => {
      if ((field.isHidden || field.isParentHidden) && field.meta.previousValue) {
        const valuesArray = Array.isArray(field.meta.previousValue)
          ? field.meta.previousValue
          : [field.meta.previousValue];
        addObsToList(
          obsForSubmission,
          valuesArray.map((obs) => voidObs(obs)),
        );
        return;
      }
      if (field.type == 'obsGroup') {
        if (field.meta.submission?.voidedValue) {
          addObsToList(obsForSubmission, field.meta.submission.voidedValue);
          return;
        }
        const obsGroup = constructObs(field, null);
        if (field.meta.previousValue) {
          obsGroup.uuid = field.meta.previousValue.uuid;
        }
        field.questions.forEach((groupedField) => {
          if (hasSubmission(groupedField)) {
            addObsToList(obsGroup.groupMembers, groupedField.meta.submission.newValue);
            addObsToList(obsGroup.groupMembers, groupedField.meta.submission.voidedValue);
          }
        });
        if (obsGroup.groupMembers.length || obsGroup.voided) {
          addObsToList(obsForSubmission, obsGroup);
        }
      }
      if (hasSubmission(field)) {
        addObsToList(obsForSubmission, field.meta.submission.newValue);
        addObsToList(obsForSubmission, field.meta.submission.voidedValue);
      }
    });
}

function prepareOrders(fields: FormField[]) {
  return fields
    .filter((field) => field.type === 'testOrder' && hasSubmission(field))
    .flatMap((field) => [field.meta.submission.newValue, field.meta.submission.voidedValue])
    .filter((o) => o);
}

function addObsToList(obsList: Array<Partial<OpenmrsObs>>, obs: Partial<OpenmrsObs>) {
  if (!obs) {
    return;
  }
  if (Array.isArray(obs)) {
    obsList.push(...obs);
  } else {
    obsList.push(obs);
  }
}

function hasSubmitableObs(field: FormField) {
  const {
    questionOptions: { isTransient },
    type,
    isHidden,
    isParentHidden,
  } = field;

  if (isTransient || !['obs', 'obsGroup'].includes(type) || hasRendering(field, 'file') || field['groupId']) {
    return false;
  }
  if ((field.isHidden || field.isParentHidden) && field.meta.previousValue) {
    return true;
  }
  return !field.isHidden && !field.isParentHidden && (type === 'obsGroup' || hasSubmission(field));
}

export function getPatientProgram(patientPrograms: Array<PatientProgram>, programUuid: string) {
  const programs = patientPrograms.filter((program) => program.program.uuid === programUuid);
  return programs;
}
