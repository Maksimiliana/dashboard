//
// SPDX-FileCopyrightText: 2020 SAP SE or an SAP affiliate company and Gardener contributors
//
// SPDX-License-Identifier: Apache-2.0
//

'use strict'

const common = require('../support/common')
const kubeconfig = require('@gardener-dashboard/kube-config')
const _ = require('lodash')
const logger = require('../../lib/logger')

module.exports = function ({ agent, sandbox, k8s, auth }) {
  /* eslint no-unused-expressions: 0 */
  const name = 'bar'
  const uid = '123-456'
  const project = 'foo'
  const namespace = `garden-${project}`
  const username = `${name}@example.org`
  const purpose = 'foo-purpose'
  const createdBy = username
  const id = username
  const user = auth.createUser({ id })
  const kind = 'infra1'
  const region = 'foo-east'
  const secretBindingName = 'fooSecretName' // pragma: whitelist secret
  const seedName = 'infra1-seed'
  const seedSecretName = `seedsecret-${seedName}`
  const profile = 'infra1-profileName'
  const { spec, metadata: { annotations } } = k8s.getShoot({
    namespace,
    name,
    createdBy,
    purpose,
    kind,
    profile,
    region,
    secretBindingName,
    seed: seedName
  })
  const resourceVersion = 42

  it('should return three shoots', async function () {
    const bearer = await user.bearer
    k8s.stub.getShoots({ bearer, namespace })
    const res = await agent
      .get(`/api/namespaces/${namespace}/shoots`)
      .set('cookie', await user.cookie)

    expect(res).to.have.status(200)
    expect(res).to.be.json
    expect(res.body.items).to.have.length(3)
  })

  it('should create a shoot', async function () {
    const bearer = await user.bearer
    k8s.stub.createShoot({ bearer, namespace, name, spec, resourceVersion })
    const res = await agent
      .post(`/api/namespaces/${namespace}/shoots`)
      .set('cookie', await user.cookie)
      .send({
        metadata: {
          name,
          namespace
        },
        spec
      })

    expect(res).to.have.status(200)
    expect(res).to.be.json
    expect(res.body.metadata).to.eql({ name, namespace, resourceVersion, annotations })
    expect(res.body.spec).to.eql(spec)
  })

  it('should return a shoot', async function () {
    const bearer = await user.bearer
    k8s.stub.getShoot({ bearer, namespace, name, uid, createdBy, purpose, kind, profile, region, secretBindingName })
    const res = await agent
      .get(`/api/namespaces/${namespace}/shoots/${name}`)
      .set('cookie', await user.cookie)

    expect(res).to.have.status(200)
    expect(res).to.be.json
    expect(res.body.metadata).to.eql({ name, namespace, uid, annotations })
    expect(res.body.spec).to.eql(spec)
  })

  it('should delete a shoot', async function () {
    const bearer = await user.bearer
    const deleteAnnotations = {
      'confirmation.gardener.cloud/deletion': 'true'
    }

    k8s.stub.deleteShoot({ bearer, namespace, name, resourceVersion })
    const res = await agent
      .delete(`/api/namespaces/${namespace}/shoots/${name}`)
      .set('cookie', await user.cookie)

    expect(res).to.have.status(200)
    expect(res).to.be.json
    expect(res.body.metadata).to.eql({ namespace, annotations: deleteAnnotations, resourceVersion })
  })

  it('should return shoot info', async function () {
    const bearer = await user.bearer
    const shootUser = 'shootFoo'
    const shootPassword = 'shootFooPwd'
    const seedClusterName = `${region}.${kind}.example.org`
    const shootServerUrl = 'https://seed.foo.bar:443'
    const dashboardUrlPath = '/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/'
    const seedShootIngressDomain = `${project}--${name}.ingress.${seedClusterName}`
    const cleanKubeconfigSpy = sandbox.spy(kubeconfig, 'cleanKubeconfig')

    common.stub.getCloudProfiles(sandbox)
    k8s.stub.getShootInfo({ bearer, namespace, name, project, kind, region, seedClusterName, shootServerUrl, shootUser, shootPassword, seedName })
    const res = await agent
      .get(`/api/namespaces/${namespace}/shoots/${name}/info`)
      .set('cookie', await user.cookie)

    expect(res).to.have.status(200)
    expect(res).to.be.json
    expect(cleanKubeconfigSpy).to.have.callCount(2)
    expect(_.keys(res.body).length).to.equal(7)
    expect(res.body).to.have.own.property('kubeconfig')
    expect(res.body.canLinkToSeed).to.equal(true)
    expect(res.body.cluster_username).to.eql(shootUser)
    expect(res.body.cluster_password).to.eql(shootPassword)
    expect(res.body.serverUrl).to.eql(shootServerUrl)
    expect(res.body.dashboardUrlPath).to.eql(dashboardUrlPath)
    expect(res.body.seedShootIngressDomain).to.eql(seedShootIngressDomain)
  })

  it('should return shoot seed info', async function () {
    const bearer = await user.bearer
    const monitoringUser = 'monitoringFoo'
    const monitoringPassword = 'monitoringFooPwd'
    const seedClusterName = `${region}.${kind}.example.org`
    const cleanKubeconfigSpy = sandbox.spy(kubeconfig, 'cleanKubeconfig')

    common.stub.getCloudProfiles(sandbox)
    k8s.stub.getSeedInfo({ bearer, namespace, name, project, kind, region, seedClusterName, monitoringUser, monitoringPassword, seedSecretName, seedName })
    const res = await agent
      .get(`/api/namespaces/${namespace}/shoots/${name}/seed-info`)
      .set('cookie', await user.cookie)

    expect(res).to.have.status(200)
    expect(res).to.be.json
    expect(cleanKubeconfigSpy).to.have.callCount(1)
    expect(_.keys(res.body).length).to.equal(2)
    expect(res.body.monitoring_username).to.eql(monitoringUser)
    expect(res.body.monitoring_password).to.eql(monitoringPassword)
  })

  it('should not return shoot seed info when seed.spec.secretRef missing', async function () {
    const bearer = await user.bearer
    const seedName = 'infra4-seed-without-secretRef' // seed without spec.secretRef

    const infoSpy = sandbox.spy(logger, 'info')
    common.stub.getCloudProfiles(sandbox)
    k8s.stub.getSeedInfoNoSecretRef({ bearer, namespace, name, project, kind, region, seedName })
    const res = await agent
      .get(`/api/namespaces/${namespace}/shoots/${name}/seed-info`)
      .set('cookie', await user.cookie)

    expect(res).to.have.status(200)
    expect(res).to.be.json
    expect(_.keys(res.body).length).to.equal(0)
    expect(infoSpy).to.be.calledOnce
  })

  it('should replace shoot', async function () {
    const bearer = await user.bearer
    const metadata = {
      annotations: {
        'gardener.cloud/created-by': 'baz@example.org'
      },
      labels: {
        foo: 'bar'
      }
    }
    k8s.stub.replaceShoot({ bearer, namespace, name, project, createdBy })
    const res = await agent
      .put(`/api/namespaces/${namespace}/shoots/${name}`)
      .set('cookie', await user.cookie)
      .send({
        metadata,
        spec
      })

    const body = res.body
    expect(res).to.have.status(200)
    expect(res).to.be.json
    expect(body.spec).to.eql(spec)
    const actLabels = body.metadata.labels
    const expLabels = metadata.labels
    expect(actLabels).to.eql(expLabels)
    const actCreatedBy = body.metadata.annotations['gardener.cloud/created-by']
    const expCreatedBy = 'baz@example.org'
    expect(actCreatedBy).to.equal(expCreatedBy)
  })

  it('should replace shoot kubernetes version', async function () {
    const bearer = await user.bearer
    const version = { version: '1.10.1' }
    k8s.stub.replaceShootK8sVersion({ bearer, namespace, name, project, createdBy })
    const res = await agent
      .put(`/api/namespaces/${namespace}/shoots/${name}/spec/kubernetes/version`)
      .set('cookie', await user.cookie)
      .send({ version })

    expect(res).to.have.status(200)
    expect(res).to.be.json
    expect(res.body.spec.kubernetes.version).to.eql(version.version)
  })

  it('should replace shoot maintenance data', async function () {
    const bearer = await user.bearer
    const maintenance = {
      timeWindow: {
        begin: '230000+0000',
        end: '000000+0000'
      },
      autoUpdate: {
        kubernetesVersion: true
      }
    }
    k8s.stub.replaceMaintenance({ bearer, namespace, name, project })
    const res = await agent
      .put(`/api/namespaces/${namespace}/shoots/${name}/spec/maintenance`)
      .set('cookie', await user.cookie)
      .send({
        timeWindowBegin: maintenance.timeWindow.begin,
        timeWindowEnd: maintenance.timeWindow.end,
        updateKubernetesVersion: maintenance.autoUpdate.kubernetesVersion
      })

    expect(res).to.have.status(200)
    expect(res).to.be.json
    expect(res.body.spec.maintenance).to.eql(maintenance)
  })

  it('should replace shoot workers', async function () {
    const bearer = await user.bearer
    const worker = {
      name: 'worker-g5rk1'
    }
    const zonesNetworkConfiguration = {
      workers: '10.250.0.0/20'
    }
    const data = {
      workers: [worker],
      network: {
        zones: [zonesNetworkConfiguration]
      }
    }
    k8s.stub.patchProvider({ bearer, namespace, name, project })
    const res = await agent
      .patch(`/api/namespaces/${namespace}/shoots/${name}/spec/provider`)
      .set('cookie', await user.cookie)
      .send(data)

    expect(res).to.have.status(200)
    expect(res).to.be.json
    expect(res.body.spec.provider).to.eql(data)
  })

  it('should replace hibernation enabled', async function () {
    const bearer = await user.bearer
    const enabled = true
    k8s.stub.replaceHibernationEnabled({ bearer, namespace, name, project })
    const res = await agent
      .put(`/api/namespaces/${namespace}/shoots/${name}/spec/hibernation/enabled`)
      .set('cookie', await user.cookie)
      .send({ enabled })

    expect(res).to.have.status(200)
    expect(res).to.be.json
    expect(res.body.spec.hibernation.enabled).to.equal(enabled)
  })

  it('should replace hibernation schedules', async function () {
    const bearer = await user.bearer
    const schedule = {
      start: '00 17 * * 1,2,3,4,5,6',
      end: '00 08 * * 1,2,3,4,5,6'
    }
    const hibernationSchedules = [schedule]
    k8s.stub.replaceHibernationSchedules({ bearer, namespace, name, project })
    const res = await agent
      .put(`/api/namespaces/${namespace}/shoots/${name}/spec/hibernation/schedules`)
      .set('cookie', await user.cookie)
      .send(hibernationSchedules)

    expect(res).to.have.status(200)
    expect(res).to.be.json
    expect(res.body.spec.hibernation.schedules).to.eql(hibernationSchedules)
  })

  it('should patch annotations', async function () {
    const bearer = await user.bearer
    const patchedAnnotations = { foo: 'bar' }
    k8s.stub.patchShootAnnotations({ bearer, namespace, name, project, createdBy })
    const res = await agent
      .patch(`/api/namespaces/${namespace}/shoots/${name}/metadata/annotations`)
      .set('cookie', await user.cookie)
      .send(patchedAnnotations)

    expect(res).to.have.status(200)
    expect(res).to.be.json
    expect(res.body.metadata.annotations).to.eql(Object.assign({}, annotations, patchedAnnotations))
  })

  it('should replace purpose', async function () {
    const bearer = await user.bearer
    const purpose = 'testing'
    k8s.stub.replacePurpose({ bearer, namespace, name, project })
    const res = await agent
      .put(`/api/namespaces/${namespace}/shoots/${name}/spec/purpose`)
      .set('cookie', await user.cookie)
      .send({ purpose })

    expect(res).to.have.status(200)
    expect(res).to.be.json
    expect(res.body.spec.purpose).to.equal(purpose)
  })
}
